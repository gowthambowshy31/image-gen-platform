import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seed...')

  // Create default users
  const adminPassword = await bcrypt.hash('admin123', 10)
  const clientPassword = await bcrypt.hash('client123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@imageGen.com' },
    update: {},
    create: {
      email: 'admin@imageGen.com',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN'
    }
  })

  const client = await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      name: 'Client User',
      password: clientPassword,
      role: 'CLIENT'
    }
  })

  console.log('✅ Created users:', { admin: admin.email, client: client.email })

  // Create default image types
  const imageTypes = [
    {
      name: 'Front View',
      description: 'Professional front view of the product on white background',
      order: 1,
      defaultPrompt: 'Create a professional product photo of {product_name} from the front view with studio lighting on a pure white background. Ensure the product is centered and fills the frame appropriately.'
    },
    {
      name: 'Side View',
      description: 'Side angle view showing product depth',
      order: 2,
      defaultPrompt: 'Create a professional product photo of {product_name} from the side view with studio lighting on a pure white background. Show the product depth and profile clearly.'
    },
    {
      name: 'Top View',
      description: 'Birds eye view of the product',
      order: 3,
      defaultPrompt: 'Create a professional product photo of {product_name} from the top view (birds eye perspective) with even lighting on a pure white background.'
    },
    {
      name: 'Lifestyle',
      description: 'Product in use or lifestyle setting',
      order: 4,
      defaultPrompt: 'Create a lifestyle photo of {product_name} being used in a realistic setting. Show the product in context with natural lighting and an appealing background.'
    },
    {
      name: 'Detail Shot',
      description: 'Close-up of important product features',
      order: 5,
      defaultPrompt: 'Create a detailed close-up photo of {product_name} highlighting important features, textures, and quality. Use macro photography style with sharp focus.'
    },
    {
      name: 'Packaging',
      description: 'Product with its packaging',
      order: 6,
      defaultPrompt: 'Create a professional photo of {product_name} with its packaging displayed. Show both the product and package attractively on a white background.'
    },
    {
      name: 'Infographic',
      description: 'Product with text and feature callouts',
      order: 7,
      defaultPrompt: 'Create an infographic style image of {product_name} with key features highlighted. Include text callouts for important specifications and benefits.'
    }
  ]

  for (const imageType of imageTypes) {
    await prisma.imageType.upsert({
      where: { name: imageType.name },
      update: imageType,
      create: imageType
    })
  }

  console.log(`✅ Created ${imageTypes.length} image types`)

  // Create default video types
  const videoTypes = [
    {
      name: 'Product Showcase',
      description: 'Professional product showcase highlighting key features',
      order: 1,
      defaultPrompt: 'Create a professional product showcase video for {product_name}. Show the product from multiple angles with smooth camera movements. Highlight key features with elegant transitions. Use professional lighting and a clean white background.'
    },
    {
      name: 'Feature Demo',
      description: 'Demonstrate product features in action',
      order: 2,
      defaultPrompt: 'Create a feature demonstration video for {product_name}. Show the product in use, highlighting its main features and functionality. Use dynamic camera angles and smooth transitions to showcase how the product works.'
    },
    {
      name: 'Lifestyle Scene',
      description: 'Product in realistic lifestyle setting',
      order: 3,
      defaultPrompt: 'Create a lifestyle video showing {product_name} in a realistic setting. Show the product being used naturally with ambient lighting. Include contextual environment that makes the product appealing and relatable.'
    },
    {
      name: '360° Rotation',
      description: 'Full 360-degree product rotation',
      order: 4,
      defaultPrompt: 'Create a smooth 360-degree rotation video of {product_name}. Show the product rotating on a turntable with professional studio lighting on a white background. Ensure smooth, continuous motion and even lighting throughout.'
    },
    {
      name: 'Unboxing Experience',
      description: 'Product unboxing and first impressions',
      order: 5,
      defaultPrompt: 'Create an unboxing experience video for {product_name}. Show the product package being opened, revealing the product inside. Highlight the packaging quality and product presentation with smooth camera movements.'
    },
    {
      name: 'Detail Focus',
      description: 'Close-up video of product details',
      order: 6,
      defaultPrompt: 'Create a detailed close-up video of {product_name}. Use macro cinematography to showcase textures, materials, and craftsmanship. Pan slowly across important features with sharp focus and professional lighting.'
    },
    {
      name: 'Social Media Short',
      description: 'Quick engaging video for social platforms',
      order: 7,
      defaultPrompt: 'Create a short, engaging social media video for {product_name}. Use dynamic cuts, attractive angles, and eye-catching visuals. Keep it fast-paced and visually appealing for social media audiences.'
    }
  ]

  for (const videoType of videoTypes) {
    await prisma.videoType.upsert({
      where: { name: videoType.name },
      update: videoType,
      create: videoType
    })
  }

  console.log(`✅ Created ${videoTypes.length} video types`)

  console.log('🎉 Database seeded successfully!')
  console.log('\nDefault credentials:')
  console.log('  Admin: admin@imageGen.com / admin123')
  console.log('  Client: client@example.com / client123')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
