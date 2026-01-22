import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'
import { downloadAndStoreImage } from '../lib/image-storage'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function populateFBAInventory() {
  console.log('🚀 Starting FBA Inventory Population...\n')

  const amazonSP = getAmazonSPClient()

  // Get admin user
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@imageGen.com' }
  })

  if (!admin) {
    console.error('❌ Admin user not found! Run npm run db:seed first.')
    process.exit(1)
  }

  try {
    // Fetch all FBA inventory ASINs
    console.log('📦 Fetching FBA inventory from Amazon...')
    const asins = await amazonSP.getFBAInventory()

    console.log(`✅ Found ${asins.length} FBA products in your inventory\n`)

    if (asins.length === 0) {
      console.log('⚠️  No FBA products found in your inventory.')
      console.log('   Make sure you have products in your Amazon seller account.')
      await prisma.$disconnect()
      await pool.end()
      return
    }

    console.log('ASINs to process:', asins.slice(0, 10).join(', '), asins.length > 10 ? `... and ${asins.length - 10} more` : '')
    console.log('')

    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (let idx = 0; idx < asins.length; idx++) {
      const asin = asins[idx]
      console.log(`\n${'='.repeat(60)}`)
      console.log(`[${idx + 1}/${asins.length}] Processing ASIN: ${asin}`)
      console.log('='.repeat(60))

      try {
        // Check if product already exists
        const existing = await prisma.product.findUnique({
          where: { asin },
          include: { sourceImages: true }
        })

        if (existing && existing.sourceImages.length > 0) {
          console.log('⚠️  Product already exists with source images, skipping...')
          skipCount++
          continue
        }

        // Fetch from Amazon
        console.log('📡 Fetching product details from Amazon SP-API...')
        const amazonProduct = await amazonSP.getProductByASIN(asin)

        if (!amazonProduct) {
          console.log('❌ Product not found on Amazon')
          errorCount++
          continue
        }

        console.log('✅ Product fetched from Amazon')
        console.log(`   Title: ${amazonProduct.title}`)
        console.log(`   Brand: ${amazonProduct.brand || 'N/A'}`)
        console.log(`   Images: ${amazonProduct.images.length}`)

        // Create or update product
        let product
        if (existing) {
          product = existing
          console.log('📝 Updating existing product...')
        } else {
          console.log('📝 Creating new product...')
          product = await prisma.product.create({
            data: {
              asin,
              title: amazonProduct.title,
              category: amazonProduct.productType || amazonProduct.brand,
              metadata: {
                brand: amazonProduct.brand,
                manufacturer: amazonProduct.manufacturer,
                attributes: amazonProduct.attributes
              },
              createdById: admin.id
            }
          })
          console.log('✅ Product created in database')
        }

        // Delete existing source images if any
        if (existing?.sourceImages.length) {
          await prisma.sourceImage.deleteMany({
            where: { productId: product.id }
          })
          console.log('🗑️  Removed old source images')
        }

        // Download and store images
        console.log(`\n📥 Downloading ${amazonProduct.images.length} images...`)
        const sourceImages = []

        for (let i = 0; i < amazonProduct.images.length; i++) {
          const amazonImage = amazonProduct.images[i]

          try {
            console.log(`   ${i + 1}/${amazonProduct.images.length} - ${amazonImage.variant} (${amazonImage.width}x${amazonImage.height})`)

            const downloadResult = await downloadAndStoreImage({
              url: amazonImage.link,
              productId: product.id,
              variant: amazonImage.variant,
              order: i
            })

            if (downloadResult.success) {
              const sourceImage = await prisma.sourceImage.create({
                data: {
                  productId: product.id,
                  amazonImageUrl: amazonImage.link,
                  localFilePath: downloadResult.filePath,
                  imageOrder: i,
                  width: downloadResult.width,
                  height: downloadResult.height,
                  fileSize: downloadResult.fileSize,
                  variant: amazonImage.variant
                }
              })

              sourceImages.push(sourceImage)
              console.log(`      ✅ Saved: ${downloadResult.fileName}`)
            } else {
              console.log(`      ❌ Failed: ${downloadResult.error}`)
            }
          } catch (error) {
            console.log(`      ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }

        console.log(`\n✅ Successfully stored ${sourceImages.length}/${amazonProduct.images.length} images`)

        // Log activity
        await prisma.activityLog.create({
          data: {
            userId: admin.id,
            action: 'POPULATE_FBA_PRODUCT',
            entityType: 'Product',
            entityId: product.id,
            metadata: {
              asin,
              title: amazonProduct.title,
              imagesDownloaded: sourceImages.length
            }
          }
        })

        successCount++

      } catch (error) {
        console.error(`\n❌ Error processing ASIN ${asin}:`, error instanceof Error ? error.message : error)
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('🎉 FBA Inventory Population Complete!')
    console.log('='.repeat(60))
    console.log(`✅ Successfully processed: ${successCount}`)
    console.log(`⚠️  Skipped (already exists): ${skipCount}`)
    console.log(`❌ Errors: ${errorCount}`)
    console.log(`📊 Total: ${asins.length}`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

populateFBAInventory()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
