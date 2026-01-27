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

async function reimportMissingImages() {
  console.log('\n🔄 Starting Image Re-import for Products with Missing Images\n')
  console.log('='.repeat(80))

  const amazonSP = getAmazonSPClient()

  try {
    // Get all products with inventory > 0
    const allProducts = await prisma.product.findMany({
      include: {
        sourceImages: true
      }
    })

    const productsWithInventory = allProducts.filter(p => {
      const metadata = p.metadata as any
      const quantity = metadata?.inventory?.quantity ?? metadata?.quantity ?? 0
      return quantity > 0
    })

    console.log(`📊 Found ${productsWithInventory.length} products with inventory > 0\n`)

    // Find products with only one image
    const productsWithOneImage = productsWithInventory.filter(p => p.sourceImages.length === 1)
    console.log(`⚠️  Found ${productsWithOneImage.length} products with only 1 image\n`)

    if (productsWithOneImage.length === 0) {
      console.log('✅ No products need image re-import!')
      return
    }

    let successCount = 0
    let errorCount = 0
    let totalImagesAdded = 0

    for (let i = 0; i < productsWithOneImage.length; i++) {
      const product = productsWithOneImage[i]
      if (!product.asin) continue

      try {
        console.log(`[${i + 1}/${productsWithOneImage.length}] Processing ${product.asin}...`)

        // Fetch product from Amazon
        const amazonProduct = await amazonSP.getProductByASIN(product.asin)

        if (!amazonProduct) {
          console.log(`   ⚠️  Could not fetch product from Amazon`)
          errorCount++
          continue
        }

        const currentImageCount = product.sourceImages.length
        const amazonImageCount = amazonProduct.images.length

        if (amazonImageCount <= currentImageCount) {
          console.log(`   ℹ️  Amazon has ${amazonImageCount} images, DB has ${currentImageCount} - skipping`)
          continue
        }

        console.log(`   📸 Found ${amazonImageCount} images on Amazon (DB has ${currentImageCount})`)

        // Delete existing source images
        await prisma.sourceImage.deleteMany({
          where: { productId: product.id }
        })

        // Download and save all images
        const sourceImages = []
        for (let j = 0; j < amazonProduct.images.length; j++) {
          const amazonImage = amazonProduct.images[j]

          try {
            const downloadResult = await downloadAndStoreImage({
              url: amazonImage.link,
              productId: product.id,
              variant: amazonImage.variant,
              order: j
            })

            if (downloadResult.success) {
              const sourceImage = await prisma.sourceImage.create({
                data: {
                  productId: product.id,
                  amazonImageUrl: amazonImage.link,
                  localFilePath: downloadResult.filePath,
                  imageOrder: j,
                  width: downloadResult.width,
                  height: downloadResult.height,
                  fileSize: downloadResult.fileSize,
                  variant: amazonImage.variant
                }
              })

              sourceImages.push(sourceImage)
            }
          } catch (error) {
            console.error(`      ⚠️  Failed to download image ${j + 1}:`, error instanceof Error ? error.message : 'Unknown error')
            // Continue with other images
          }
        }

        const imagesAdded = sourceImages.length - currentImageCount
        totalImagesAdded += imagesAdded

        console.log(`   ✅ Successfully imported ${sourceImages.length} images (added ${imagesAdded} new images)`)
        successCount++

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`   ❌ Error processing ${product.asin}:`, error instanceof Error ? error.message : 'Unknown error')
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ Re-import Complete!')
    console.log('='.repeat(80))
    console.log(`   Products processed: ${successCount}`)
    console.log(`   Products with errors: ${errorCount}`)
    console.log(`   Total images added: ${totalImagesAdded}`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ Error during re-import:', error)
    throw error
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

// Run the re-import
reimportMissingImages()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
