import { prisma } from '../lib/prisma'

async function checkProductImages() {
  const productId = 'cmk2efv4o05avb0ewz6gehomn'

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        sourceImages: {
          select: {
            id: true,
            variant: true,
            amazonImageUrl: true
          }
        },
        images: {
          select: {
            id: true,
            fileName: true,
            status: true,
            version: true,
            imageType: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!product) {
      console.log('Product not found')
      return
    }

    console.log('\n=== Product Info ===')
    console.log(`Title: ${product.title}`)
    console.log(`ASIN: ${product.asin}`)
    console.log(`Source Images: ${product.sourceImages.length}`)
    console.log(`Generated Images: ${product.images.length}`)

    console.log('\n=== Generated Images ===')
    product.images.forEach((img, idx) => {
      console.log(`${idx + 1}. ${img.imageType.name} - v${img.version}`)
      console.log(`   Status: ${img.status}`)
      console.log(`   File: ${img.fileName}`)
    })

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkProductImages()
