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

async function importMissingProducts() {
  console.log('\n🚀 Starting Import of Missing Products from Amazon\n')
  console.log('='.repeat(80))

  const amazonSP = getAmazonSPClient()

  // Get admin user
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  })

  if (!admin) {
    console.error('❌ Admin user not found!')
    process.exit(1)
  }

  try {
    // Step 1: Get all products from Amazon with inventory > 0
    console.log('📦 Step 1: Fetching FBA inventory from Amazon (inventory > 0)...')
    const amazonInventory = await amazonSP.getFBAInventoryWithQuantity(false) // false = only items with quantity > 0
    console.log(`✅ Found ${amazonInventory.length} products with inventory > 0 in Amazon\n`)

    // Step 2: Get all products from database
    console.log('📊 Step 2: Checking existing products in database...')
    const dbProducts = await prisma.product.findMany({
      where: {
        asin: { not: null }
      },
      select: {
        asin: true
      }
    })

    const dbAsins = new Set(dbProducts.map(p => p.asin).filter(Boolean) as string[])
    console.log(`✅ Found ${dbAsins.size} products in database\n`)

    // Step 3: Find missing products
    const missingProducts = amazonInventory.filter(item => !dbAsins.has(item.asin))
    console.log(`📋 Step 3: Found ${missingProducts.length} products in Amazon but not in database\n`)

    if (missingProducts.length === 0) {
      console.log('✅ No missing products to import!')
      await prisma.$disconnect()
      await pool.end()
      return
    }

    // Show summary
    console.log('📊 Products to import:')
    const sortedByQty = [...missingProducts].sort((a, b) => b.quantity - a.quantity)
    console.log(`   Top 10 by quantity:`)
    sortedByQty.slice(0, 10).forEach((item, idx) => {
      console.log(`      ${idx + 1}. ${item.asin} - Qty: ${item.quantity} - ${item.productName?.substring(0, 50) || 'N/A'}...`)
    })
    console.log('')

    let successCount = 0
    let errorCount = 0
    const errors: Array<{ asin: string; error: string }> = []

    // Step 4: Import missing products
    console.log(`\n🔄 Step 4: Importing ${missingProducts.length} missing products...\n`)

    for (let idx = 0; idx < missingProducts.length; idx++) {
      const inventoryItem = missingProducts[idx]
      const asin = inventoryItem.asin
      const quantity = inventoryItem.quantity

      console.log(`${'─'.repeat(80)}`)
      console.log(`[${idx + 1}/${missingProducts.length}] Processing: ${asin} (Qty: ${quantity})`)
      console.log(`${'─'.repeat(80)}`)

      try {
        // Fetch product details from Amazon
        console.log('📡 Fetching product details from Amazon...')
        const amazonProduct = await amazonSP.getProductByASIN(asin)

        if (!amazonProduct) {
          console.log('❌ Product not found on Amazon')
          errorCount++
          errors.push({ asin, error: 'Product not found on Amazon' })
          continue
        }

        console.log(`✅ Product found: ${amazonProduct.title}`)
        console.log(`   Brand: ${amazonProduct.brand || 'N/A'}`)
        console.log(`   Images: ${amazonProduct.images.length}`)

        // Create product
        console.log('📝 Creating product in database...')
        const product = await prisma.product.create({
          data: {
            asin,
            title: amazonProduct.title,
            category: amazonProduct.productType || amazonProduct.brand || 'Uncategorized',
            status: 'NOT_STARTED',
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
        console.log('✅ Product created')

        // Download and store images
        if (amazonProduct.images.length > 0) {
          console.log(`\n📥 Downloading ${amazonProduct.images.length} images...`)
          const sourceImages = []

          for (let i = 0; i < amazonProduct.images.length; i++) {
            const amazonImage = amazonProduct.images[i]

            try {
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
                console.log(`   ✅ Image ${i + 1}/${amazonProduct.images.length} - ${amazonImage.variant}`)
              } else {
                console.log(`   ⚠️  Image ${i + 1}/${amazonProduct.images.length} - Failed: ${downloadResult.error}`)
              }
            } catch (error) {
              console.log(`   ❌ Image ${i + 1}/${amazonProduct.images.length} - Error: ${error instanceof Error ? error.message : 'Unknown'}`)
            }
          }

          console.log(`\n✅ Successfully imported ${sourceImages.length}/${amazonProduct.images.length} images`)
        } else {
          console.log('⚠️  No images available for this product')
        }

        // Log activity
        await prisma.activityLog.create({
          data: {
            userId: admin.id,
            action: 'IMPORT_MISSING_PRODUCT',
            entityType: 'Product',
            entityId: product.id,
            metadata: {
              asin,
              title: amazonProduct.title,
              imagesImported: amazonProduct.images.length,
              inventory: quantity
            }
          }
        })

        successCount++
        console.log(`✅ Successfully imported ${asin}\n`)

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (error) {
        console.error(`\n❌ Error processing ${asin}:`, error instanceof Error ? error.message : error)
        errorCount++
        errors.push({ asin, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(80))
    console.log('🎉 Import Complete!')
    console.log('='.repeat(80))
    console.log(`✅ Successfully imported: ${successCount}`)
    console.log(`❌ Errors: ${errorCount}`)
    console.log(`📊 Total processed: ${missingProducts.length}`)
    console.log('='.repeat(80))

    if (errors.length > 0) {
      console.log('\n⚠️  Products with errors:')
      errors.forEach(({ asin, error }) => {
        console.log(`   - ${asin}: ${error}`)
      })
    }

    // Verify final count
    console.log('\n📊 Verification:')
    const finalDbCount = await prisma.product.count({
      where: {
        asin: { not: null }
      }
    })
    console.log(`   Products in database: ${finalDbCount}`)
    console.log(`   Products in Amazon (inventory > 0): ${amazonInventory.length}`)
    console.log(`   Difference: ${Math.abs(amazonInventory.length - finalDbCount)}`)

  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

// Run the import
importMissingProducts()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
