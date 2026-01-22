import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: {
    id: string
  }
}

/**
 * GET /api/products/[id]/source-images
 * Get all source images for a product
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sourceImages = await prisma.sourceImage.findMany({
      where: {
        productId: params.id
      },
      orderBy: {
        imageOrder: 'asc'
      }
    })

    return NextResponse.json(sourceImages)
  } catch (error) {
    console.error("Error fetching source images:", error)
    return NextResponse.json(
      { error: "Failed to fetch source images" },
      { status: 500 }
    )
  }
}
