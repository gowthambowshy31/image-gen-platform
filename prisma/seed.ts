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

  // Create Amazon/Walmart listing prompt templates for jewelry
  const amazonWalmartTemplates = [
    {
      name: 'Jewelry - Image 1: Front & Side Angles',
      description: 'Front facing and side facing angles on white background for jewelry products',
      category: 'image',
      promptText: `Hyper-realistic product photography of a pair of 18k [white gold] [oval 'inside-out' diamond hoop earrings] like the [earrings] in the attached image. The metal is polished with a mirror-like finish. The earring closure mechanism is a [screwback]. The earrings are placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas. The left earring is framed straight-on to show the full frontal diamond row, while the right earring is slightly staggered and tilted at a 45-degree angle to showcase the side profile and interior diamonds. Position the camera at a slight 'eye-level' elevation to give the subject a grounded, three-dimensional presence. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use Perfectly symmetrical diamonds with high fire, brilliance, and sharp facets.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Image 2: Alternate Angle',
      description: 'Alternate angle on white background (for pendants, rings, etc)',
      category: 'image',
      promptText: `Hyper-realistic product photography of a pair of 18k [white gold] [oval 'inside-out' diamond hoop earrings] like the [earrings] in the attached image. The metal is polished with a mirror-like finish. The earrings are placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas. The subject is tilted at a 45-degree angle to showcase the side profile. Position the camera at a slight 'eye-level' elevation to give the subject a grounded, three-dimensional presence. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use Perfectly symmetrical diamonds with high fire, brilliance, and sharp facets.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Image 3: Natural Surface Flat-lay',
      description: 'Hyper-realistic image with shadows on a natural surface',
      category: 'image',
      promptText: `Professional flat-lay product photography of a pair of 18k [white gold] [oval 'inside-out' diamond hoop earrings] like the [earrings] in the attached image. The earring closure mechanism is a [screwback]. The subject is laid flat on a minimalist white fabric surface, arranged in a balanced diagonal composition (one in the top-right and one in the bottom-left of the frame). The subjects are oriented to clearly showcase the 'inside-out' round brilliant diamonds. Use soft, natural sunlight lighting that casts a distinct, natural shadow. Macro focus with sharp detail on the diamond facets and the high-polish metal finish. Use 8k resolution and a clean and airy luxury e-commerce aesthetic. Use perfectly symmetrical diamonds with high fire, brilliance, and sharp facets.The subject is placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Image 4: Model Wearing',
      description: 'True to size jewelry on a human model',
      category: 'image',
      promptText: `High-end fashion editorial photography of a woman's [ear] featuring the [earrings] in the attached image. Use perfectly symmetrical diamonds with high fire, brilliance, and sharp facets. The metal is [18k white gold]. The model has dark brown hair pulled back into a soft ponytail, tucked behind her ear to showcase the jewelry. She is wearing a structured tan or camel-colored blazer. The background is a clean, minimalist warm beige studio wall. Lighting is soft and diffused, coming from the side to create gentle, natural shadows on the skin and a soft 'glow' on the polished metal. Close-up macro shot, sharp focus on the jewelry, 8k resolution, clean luxury aesthetic. You cannot see the model's eyes, only her ear.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Image 5: Size Reference',
      description: 'Measurement image next to a coin or ruler',
      category: 'image',
      promptText: `Professional product photography showing the jewelry next to a coin or ruler for scale reference. The jewelry and reference object are placed on a clean white background with soft, even lighting. The composition clearly shows the actual size of the jewelry piece. Use sharp focus on both the jewelry and the reference object. 8k resolution, clean e-commerce aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Image 6: Privosa Packaging',
      description: 'Product in Privosa branded packaging',
      category: 'image',
      promptText: `Place the attached earrings from the 1st image in Privosa packaging as shown in the 2nd image. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use perfectly symmetrical diamonds with high fire, brilliance, and sharp facets for the earrings.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    },
    {
      name: 'Jewelry - Video 1: 360° Rotation',
      description: '360 degree rotation video on a white background',
      category: 'video',
      promptText: `Create a smooth 360-degree rotation video of the jewelry piece in the attached image. The metal is polished with a mirror-like finish. Show the jewelry rotating slowly on a turntable or floating with elegant motion. Use soft, diffused overhead studio lighting on a seamless pure white background with a subtle reflection. The rotation should be smooth and continuous, showcasing all angles of the piece. Use perfectly symmetrical diamonds with high fire, brilliance, and sharp facets. 8k resolution, clean luxury e-commerce aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 1 }
      ]
    }
  ]

  for (const template of amazonWalmartTemplates) {
    const { variables, ...templateData } = template

    const createdTemplate = await prisma.promptTemplate.upsert({
      where: { name: template.name },
      update: {
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        isActive: true
      },
      create: {
        name: templateData.name,
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        isActive: true
      }
    })

    // Delete existing variables and recreate them
    await prisma.templateVariable.deleteMany({
      where: { templateId: createdTemplate.id }
    })

    for (const variable of variables) {
      await prisma.templateVariable.create({
        data: {
          templateId: createdTemplate.id,
          name: variable.name,
          displayName: variable.displayName,
          type: variable.type as 'TEXT' | 'DROPDOWN' | 'AUTO',
          isRequired: variable.isRequired,
          defaultValue: null,
          options: [],
          autoFillSource: variable.autoFillSource || null,
          order: variable.order
        }
      })
    }
  }

  console.log(`✅ Created ${amazonWalmartTemplates.length} Amazon/Walmart listing templates`)

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
