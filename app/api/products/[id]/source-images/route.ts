import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{
    id: string
  }>
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
    const { id } = await params

    const sourceImages = await prisma.sourceImage.findMany({
      where: {
        productId: id
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
