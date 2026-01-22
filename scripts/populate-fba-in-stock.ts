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

async function populateFBAInStockInventory() {
  console.log('🚀 Starting FBA In-Stock Inventory Population (Quantity > 0)...\n')

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
    // Fetch FBA inventory with quantity data (only items with quantity > 0)
    console.log('📦 Fetching FBA in-stock inventory from Amazon...')
    const inventoryItems = await amazonSP.getFBAInventoryWithQuantity(false) // false = only items with quantity > 0

    console.log(`✅ Found ${inventoryItems.length} FBA products with inventory > 0\n`)

    if (inventoryItems.length === 0) {
      console.log('⚠️  No FBA products with inventory found.')
      console.log('   Make sure you have products in stock in your Amazon seller account.')
      await prisma.$disconnect()
      await pool.end()
      return
    }

    // Show summary by quantity
    const sortedByQty = [...inventoryItems].sort((a, b) => b.quantity - a.quantity)
    console.log('📊 Top 10 products by quantity:')
    sortedByQty.slice(0, 10).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.asin} - Qty: ${item.quantity} - ${item.productName?.substring(0, 60)}...`)
    })
    console.log('')

    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (let idx = 0; idx < inventoryItems.length; idx++) {
      const inventoryItem = inventoryItems[idx]
      const asin = inventoryItem.asin
      const quantity = inventoryItem.quantity

      console.log(`\n${'='.repeat(70)}`)
      console.log(`[${idx + 1}/${inventoryItems.length}] Processing ASIN: ${asin} (Quantity: ${quantity})`)
      console.log('='.repeat(70))

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
        console.log(`   Inventory: ${quantity} units`)

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
                attributes: amazonProduct.attributes,
                inventory: {
                  quantity: quantity,
                  lastChecked: new Date().toISOString()
                }
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
            action: 'POPULATE_FBA_IN_STOCK',
            entityType: 'Product',
            entityId: product.id,
            metadata: {
              asin,
              title: amazonProduct.title,
              imagesDownloaded: sourceImages.length,
              inventory: quantity
            }
          }
        })

        successCount++

      } catch (error) {
        console.error(`\n❌ Error processing ASIN ${asin}:`, error instanceof Error ? error.message : error)
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 FBA In-Stock Inventory Population Complete!')
    console.log('='.repeat(70))
    console.log(`✅ Successfully processed: ${successCount}`)
    console.log(`⚠️  Skipped (already exists): ${skipCount}`)
    console.log(`❌ Errors: ${errorCount}`)
    console.log(`📊 Total items with inventory > 0: ${inventoryItems.length}`)
    console.log('='.repeat(70))

  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

populateFBAInStockInventory()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
