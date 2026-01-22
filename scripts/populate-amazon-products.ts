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

async function populateProducts(asins: string[]) {
  console.log('🚀 Starting Amazon Product Population...\n')

  const amazonSP = getAmazonSPClient()

  // Get admin user
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@imageGen.com' }
  })

  if (!admin) {
    console.error('❌ Admin user not found! Run npm run db:seed first.')
    process.exit(1)
  }

  for (const asin of asins) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Processing ASIN: ${asin}`)
    console.log('='.repeat(60))

    try {
      // Check if product already exists
      const existing = await prisma.product.findUnique({
        where: { asin },
        include: { sourceImages: true }
      })

      if (existing && existing.sourceImages.length > 0) {
        console.log('⚠️  Product already exists with source images, skipping...')
        continue
      }

      // Fetch from Amazon
      console.log('📡 Fetching product from Amazon SP-API...')
      const amazonProduct = await amazonSP.getProductByASIN(asin)

      if (!amazonProduct) {
        console.log('❌ Product not found on Amazon')
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
          action: 'POPULATE_AMAZON_PRODUCT',
          entityType: 'Product',
          entityId: product.id,
          metadata: {
            asin,
            title: amazonProduct.title,
            imagesDownloaded: sourceImages.length
          }
        }
      })

    } catch (error) {
      console.error(`\n❌ Error processing ASIN ${asin}:`, error instanceof Error ? error.message : error)
    }
  }

  await prisma.$disconnect()
  await pool.end()

  console.log('\n' + '='.repeat(60))
  console.log('🎉 Population Complete!')
  console.log('='.repeat(60))
}

// ASINs to populate - Add your Amazon product ASINs here
const asinsToPopulate: string[] = [
  // Add your ASINs here, for example:
  // 'B08N5WRWNW',
  // 'B0ABC123XY',
]

// Check if ASINs provided as command line arguments
const cliAsins = process.argv.slice(2)

if (cliAsins.length > 0) {
  console.log(`📋 Using ASINs from command line: ${cliAsins.join(', ')}`)
  populateProducts(cliAsins)
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
} else if (asinsToPopulate.length > 0) {
  console.log(`📋 Using ASINs from script: ${asinsToPopulate.join(', ')}`)
  populateProducts(asinsToPopulate)
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
} else {
  console.log('❌ No ASINs provided!')
  console.log('\nUsage:')
  console.log('  npm run populate -- ASIN1 ASIN2 ASIN3')
  console.log('  or')
  console.log('  Edit scripts/populate-amazon-products.ts and add ASINs to the array')
  process.exit(1)
}
