import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createCommentSchema = z.object({
  content: z.string().min(1),
  issueTag: z.string().optional()
})

// POST /api/images/[id]/comments - Add a comment to an image
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validated = createCommentSchema.parse(body)

    const comment = await prisma.comment.create({
      data: {
        imageId: params.id,
        userId: (session.user as any).id,
        content: validated.content,
        issueTag: validated.issueTag
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error creating comment:", error)
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    )
  }
}

// GET /api/images/[id]/comments - Get all comments for an image
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const comments = await prisma.comment.findMany({
      where: {
        imageId: params.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error("Error fetching comments:", error)
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    )
  }
}
