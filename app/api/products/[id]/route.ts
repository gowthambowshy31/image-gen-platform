import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateProductSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.any().optional(),
  originalImageUrl: z.string().url().optional()
})

// GET /api/products/[id] - Get a single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        sourceImages: {
          select: {
            id: true,
            amazonImageUrl: true,
            localFilePath: true,
            variant: true,
            width: true,
            height: true,
            imageOrder: true
          },
          orderBy: {
            imageOrder: 'asc'
          }
        },
        images: {
          select: {
            id: true,
            imageTypeId: true,
            status: true,
            version: true,
            fileName: true,
            filePath: true,
            width: true,
            height: true,
            createdAt: true,
            sourceImageId: true,
            parentImageId: true,
            imageType: {
              select: {
                id: true,
                name: true,
                description: true
              }
            },
            sourceImage: {
              select: {
                id: true,
                variant: true,
                localFilePath: true
              }
            },
            parentImage: {
              select: {
                id: true,
                fileName: true,
                version: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        },
        promptOverrides: {
          include: {
            imageType: true
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error("Error fetching product:", error)
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    )
  }
}

// PATCH /api/products/[id] - Update a product
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validated = updateProductSchema.parse(body)

    const product = await prisma.product.update({
      where: { id },
      data: validated,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    // Log activity
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: "UPDATE_PRODUCT",
          entityType: "Product",
          entityId: product.id,
          metadata: validated
        }
      })
    }

    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error updating product:", error)
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Delete a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await prisma.product.delete({
      where: { id }
    })

    // Log activity
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: "DELETE_PRODUCT",
          entityType: "Product",
          entityId: id
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    )
  }
}
