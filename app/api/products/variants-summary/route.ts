import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/products/variants-summary - Get variant counts across all products
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productIds = searchParams.get("productIds")

    const where: any = {}

    // If specific product IDs provided, filter to those
    if (productIds) {
      where.productId = { in: productIds.split(",") }
    }

    const variants = await prisma.sourceImage.groupBy({
      by: ["variant"],
      where,
      _count: { variant: true },
      orderBy: { _count: { variant: "desc" } }
    })

    return NextResponse.json({
      variants: variants.map(v => ({
        variant: v.variant || "UNKNOWN",
        count: v._count.variant
      }))
    })
  } catch (error) {
    console.error("Error fetching variants summary:", error)
    return NextResponse.json(
      { error: "Failed to fetch variants summary" },
      { status: 500 }
    )
  }
}
