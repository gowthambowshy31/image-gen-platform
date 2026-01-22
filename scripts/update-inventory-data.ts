import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { getAmazonSPClient } from '../lib/amazon-sp'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function updateInventoryData() {
  console.log('🔄 Updating Inventory Data for Existing Products...\n')

  const amazonSP = getAmazonSPClient()

  try {
    // Fetch FBA inventory with quantity data
    console.log('📦 Fetching FBA inventory from Amazon...')
    const inventoryItems = await amazonSP.getFBAInventoryWithQuantity(true) // true = include all items

    console.log(`✅ Found ${inventoryItems.length} total FBA products`)

    const withStock = inventoryItems.filter(item => item.quantity > 0)
    console.log(`📊 Products with inventory > 0: ${withStock.length}\n`)

    // Create a map of ASIN to quantity
    const inventoryMap = new Map<string, number>()
    inventoryItems.forEach(item => {
      inventoryMap.set(item.asin, item.quantity)
    })

    // Get all products from database
    const allProducts = await prisma.product.findMany({
      select: {
        id: true,
        asin: true,
        title: true,
        metadata: true
      }
    })

    console.log(`📚 Found ${allProducts.length} products in database\n`)

    let updatedCount = 0
    let skippedCount = 0

    for (const product of allProducts) {
      const quantity = inventoryMap.get(product.asin)

      if (quantity !== undefined) {
        // Update product metadata with inventory info
        const metadata = (product.metadata as any) || {}
        metadata.inventory = {
          quantity: quantity,
          lastChecked: new Date().toISOString()
        }

        await prisma.product.update({
          where: { id: product.id },
          data: { metadata }
        })

        if (quantity > 0) {
          console.log(`✅ ${product.asin} - Updated inventory: ${quantity} units`)
        }
        updatedCount++
      } else {
        skippedCount++
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('✅ Inventory Update Complete!')
    console.log('='.repeat(70))
    console.log(`✅ Updated: ${updatedCount} products`)
    console.log(`⚠️  Skipped (not in FBA): ${skippedCount} products`)
    console.log(`📊 Products with stock > 0: ${withStock.length}`)
    console.log('='.repeat(70))

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

updateInventoryData()
