import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// POST /api/admin/setup-database - Initialize database with seed data
export async function POST(request: NextRequest) {
  try {
    // Check if setup is needed (no users exist)
    const userCount = await prisma.user.count()

    if (userCount > 0) {
      return NextResponse.json({
        message: "Database already initialized",
        userCount
      })
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash("admin123", 12)
    const admin = await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "Admin User",
        password: hashedPassword,
        role: "ADMIN"
      }
    })

    // Create default image types
    const imageTypes = await prisma.imageType.createMany({
      data: [
        {
          name: "Main Image",
          description: "Primary product image with white background",
          defaultPrompt: "Professional product photography on pure white background, high resolution, studio lighting, e-commerce ready"
        },
        {
          name: "Lifestyle",
          description: "Product in a lifestyle setting",
          defaultPrompt: "Product in realistic lifestyle setting, natural lighting, aspirational context, showing product in use"
        },
        {
          name: "Infographic",
          description: "Product with feature callouts",
          defaultPrompt: "Product infographic with feature callouts, clean design, highlighting key benefits and specifications"
        },
        {
          name: "Size Comparison",
          description: "Product with size reference",
          defaultPrompt: "Product shown with common size reference objects for scale, clear dimensions visible"
        },
        {
          name: "Package Contents",
          description: "All items included in package",
          defaultPrompt: "Flat lay of all items included in package, organized neatly, white background"
        }
      ],
      skipDuplicates: true
    })

    // Create default video types
    const videoTypes = await prisma.videoType.createMany({
      data: [
        {
          name: "Product Showcase",
          description: "360-degree product rotation video",
          defaultPrompt: "Smooth 360-degree rotation of product, white background, professional lighting"
        },
        {
          name: "Feature Demo",
          description: "Video demonstrating product features",
          defaultPrompt: "Demonstration of product features and benefits, close-up shots, engaging presentation"
        }
      ],
      skipDuplicates: true
    })

    return NextResponse.json({
      success: true,
      message: "Database initialized successfully",
      data: {
        admin: { id: admin.id, email: admin.email },
        imageTypesCreated: imageTypes.count,
        videoTypesCreated: videoTypes.count
      }
    })
  } catch (error) {
    console.error("Error setting up database:", error)
    return NextResponse.json(
      { error: "Failed to setup database", details: String(error) },
      { status: 500 }
    )
  }
}

// GET /api/admin/setup-database - Check database status
export async function GET() {
  try {
    const [userCount, productCount, imageTypeCount] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.imageType.count()
    ])

    return NextResponse.json({
      initialized: userCount > 0,
      counts: {
        users: userCount,
        products: productCount,
        imageTypes: imageTypeCount
      }
    })
  } catch (error) {
    console.error("Error checking database status:", error)
    return NextResponse.json(
      { error: "Failed to check database status", details: String(error) },
      { status: 500 }
    )
  }
}
