/**
 * Migration Script: Update Source Image Variants
 *
 * This script re-fetches variant information from Amazon for all existing
 * source images that currently have incorrect variant data (all showing "MAIN").
 *
 * Usage:
 *   npx tsx scripts/migrate-image-variants.ts [--dry-run] [--limit=N]
 *
 * Options:
 *   --dry-run   Preview changes without updating the database
 *   --limit=N   Process only N products (useful for testing)
 */

import { prisma } from '../lib/prisma'
import { AmazonSPService } from '../lib/amazon-sp'

interface MigrationStats {
  productsProcessed: number
  productsSkipped: number
  productsFailed: number
  imagesUpdated: number
  imagesSkipped: number
}

async function migrateImageVariants(options: { dryRun: boolean; limit?: number }) {
  const { dryRun, limit } = options
  const stats: MigrationStats = {
    productsProcessed: 0,
    productsSkipped: 0,
    productsFailed: 0,
    imagesUpdated: 0,
    imagesSkipped: 0
  }

  console.log('='.repeat(60))
  console.log('Image Variant Migration Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  if (limit) console.log(`Limit: ${limit} products`)
  console.log('')

  // Get all products with ASINs that have source images
  const products = await prisma.product.findMany({
    where: {
      asin: { not: null },
      sourceImages: { some: {} }
    },
    include: {
      sourceImages: {
        orderBy: { imageOrder: 'asc' }
      }
    },
    take: limit
  })

  console.log(`Found ${products.length} products with ASINs and source images`)
  console.log('')

  const amazonService = new AmazonSPService()

  for (const product of products) {
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`Processing: ${product.asin} - ${product.title.substring(0, 50)}...`)

    try {
      // Fetch fresh data from Amazon
      const amazonProduct = await amazonService.getProductByASIN(product.asin!)

      if (!amazonProduct) {
        console.log(`  ⚠ Product not found on Amazon, skipping`)
        stats.productsSkipped++
        continue
      }

      console.log(`  Found ${amazonProduct.images.length} images from Amazon`)

      // Group Amazon images by URL for matching (take highest resolution per unique image)
      const amazonImagesByBaseUrl = new Map<string, { variant: string; width: number; height: number }>()

      for (const img of amazonProduct.images) {
        // Extract base URL (remove size suffix like _SL75_)
        const baseUrl = img.link.replace(/\._[^.]+_\./, '.')

        const existing = amazonImagesByBaseUrl.get(baseUrl)
        if (!existing || (img.width * img.height > existing.width * existing.height)) {
          amazonImagesByBaseUrl.set(baseUrl, {
            variant: img.variant,
            width: img.width,
            height: img.height
          })
        }
      }

      // Also create a map by full URL for exact matches
      const amazonImagesByFullUrl = new Map<string, string>()
      for (const img of amazonProduct.images) {
        amazonImagesByFullUrl.set(img.link, img.variant)
      }

      // Update each source image
      for (const sourceImage of product.sourceImages) {
        // Try exact URL match first
        let newVariant = amazonImagesByFullUrl.get(sourceImage.amazonImageUrl)

        // If no exact match, try base URL match
        if (!newVariant) {
          const baseUrl = sourceImage.amazonImageUrl.replace(/\._[^.]+_\./, '.')
          const match = amazonImagesByBaseUrl.get(baseUrl)
          newVariant = match?.variant
        }

        if (!newVariant) {
          console.log(`  ⚠ No match for image order ${sourceImage.imageOrder}: ${sourceImage.amazonImageUrl.substring(0, 60)}...`)
          stats.imagesSkipped++
          continue
        }

        if (sourceImage.variant === newVariant) {
          console.log(`  ✓ Image ${sourceImage.imageOrder} already correct: ${newVariant}`)
          stats.imagesSkipped++
          continue
        }

        console.log(`  → Image ${sourceImage.imageOrder}: "${sourceImage.variant}" → "${newVariant}"`)

        if (!dryRun) {
          await prisma.sourceImage.update({
            where: { id: sourceImage.id },
            data: { variant: newVariant }
          })
        }

        stats.imagesUpdated++
      }

      stats.productsProcessed++

      // Rate limiting - wait 500ms between products to avoid Amazon API throttling
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (error) {
      console.error(`  ✗ Error processing product:`, error)
      stats.productsFailed++
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('Migration Summary')
  console.log('='.repeat(60))
  console.log(`Products processed: ${stats.productsProcessed}`)
  console.log(`Products skipped:   ${stats.productsSkipped}`)
  console.log(`Products failed:    ${stats.productsFailed}`)
  console.log(`Images updated:     ${stats.imagesUpdated}`)
  console.log(`Images skipped:     ${stats.imagesSkipped}`)

  if (dryRun) {
    console.log('\n⚠ DRY RUN - No changes were made to the database')
    console.log('Run without --dry-run to apply changes')
  }

  return stats
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

// Run the migration
migrateImageVariants({ dryRun, limit })
  .then(() => {
    console.log('\nMigration complete!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\nMigration failed:', error)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
