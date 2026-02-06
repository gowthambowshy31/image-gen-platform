import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { generatePromptFromImage } from "@/lib/gemini"

const imageSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
})

const requestSchema = z.object({
  images: z.array(imageSchema).min(1).max(10),
})

const ANALYSIS_PROMPT = `You are an expert product photographer and AI image generation prompt engineer specializing in jewelry photography for e-commerce listings.

Analyze this jewelry product image with extreme attention to detail and generate ONE highly detailed, comprehensive prompt that can be used with an AI image generation model.

Your response MUST follow this exact format:

PRODUCT_DESCRIPTION:
[2-3 sentence description of the jewelry piece - type, metal, stones, design, finish]

GENERATION_PROMPT:
[A single, extremely detailed paragraph of 150-250 words. This must be a comprehensive image generation prompt that captures EVERY visual detail of this product. Include:
- Exact jewelry type and style (e.g., huggie hoop, solitaire pendant, tennis bracelet)
- Metal type, color, and finish (e.g., polished 14k yellow gold, brushed platinum)
- Stone details: type, cut, setting style, arrangement, size, clarity, color
- Design features: texture, patterns, engravings, structural elements
- Physical characteristics: thickness, dimensions, closure mechanism
- Light interaction: how the metal reflects, how stones refract and sparkle
- Surface quality: polish level, any matte or satin sections
- Overall aesthetic and style impression

The prompt should be so detailed that someone could recreate an identical piece from the description alone. Write it as a direct image generation instruction, not a description. Professional product photography quality, suitable for Amazon listing imagery.]

Keep language precise, technical, and photography-focused.`

interface AnalysisResult {
  productDescription: string
  generationPrompt: string
}

function parseAnalysisResponse(text: string): AnalysisResult {
  const result: AnalysisResult = {
    productDescription: "",
    generationPrompt: "",
  }

  // Extract product description
  const descMatch = text.match(
    /PRODUCT_DESCRIPTION:\s*([\s\S]*?)(?=GENERATION_PROMPT:|$)/i
  )
  if (descMatch) {
    result.productDescription = descMatch[1].trim()
  }

  // Extract generation prompt
  const promptMatch = text.match(
    /GENERATION_PROMPT:\s*([\s\S]*?)$/i
  )
  if (promptMatch) {
    result.generationPrompt = promptMatch[1].trim()
  }

  // Fallback: if parsing failed, use the whole text as the prompt
  if (!result.generationPrompt) {
    result.generationPrompt = text.trim()
    result.productDescription = "Could not parse structured response from AI."
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = requestSchema.parse(body)

    const results = []

    for (const image of validated.images) {
      try {
        console.log(`Analyzing image: ${image.fileName}`)
        const rawResponse = await generatePromptFromImage(
          image.base64,
          image.mimeType,
          ANALYSIS_PROMPT
        )

        const analysis = parseAnalysisResponse(rawResponse)

        results.push({
          fileName: image.fileName,
          success: true,
          analysis,
        })
        console.log(`Successfully analyzed: ${image.fileName}`)
      } catch (error) {
        console.error(`Failed to analyze ${image.fileName}:`, error)
        results.push({
          fileName: image.fileName,
          success: false,
          error: error instanceof Error ? error.message : "Analysis failed",
          analysis: null,
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error in generate-prompt:", error)
    return NextResponse.json(
      { error: "Failed to generate prompts" },
      { status: 500 }
    )
  }
}
