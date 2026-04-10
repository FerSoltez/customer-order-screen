"use client"

import { Canvas } from "@react-three/fiber"
import { useThree } from "@react-three/fiber"
import { OrbitControls, Environment, useGLTF } from "@react-three/drei"
import { useRef, useMemo, useEffect, Suspense, useState, useCallback } from "react"
import * as THREE from "three"

interface TShirtModelProps {
  bodyColor: string
  textureCanvas?: HTMLCanvasElement | null
  textureRevision?: number
  onReady?: () => void
}

function TShirtModel({ bodyColor, textureCanvas, textureRevision = 0, onReady }: TShirtModelProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const { scene } = useGLTF("/models/CamisaCuelloRedondo.glb")
  const { gl } = useThree()
  const appliedTextureRef = useRef<THREE.Texture | null>(null)

  // Clone the scene so we can safely modify materials without side-effects
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    // Center the model based on its bounding box
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)
    return clone
  }, [scene])

  useEffect(() => {
    // Keep color pipeline consistent so textures do not look washed out.
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  useEffect(() => {
    if (!textureCanvas) return

    const maxAnisotropy = Math.max(1, gl.capabilities.getMaxAnisotropy())
    const nextTexture = new THREE.CanvasTexture(textureCanvas)
    nextTexture.flipY = false
    nextTexture.wrapS = THREE.ClampToEdgeWrapping
    nextTexture.wrapT = THREE.ClampToEdgeWrapping
    nextTexture.colorSpace = THREE.SRGBColorSpace
    // Dynamic texture: keep update cost stable and avoid mipmap regeneration overhead.
    nextTexture.generateMipmaps = false
    nextTexture.minFilter = THREE.LinearFilter
    nextTexture.magFilter = THREE.LinearFilter
    nextTexture.anisotropy = maxAnisotropy
    nextTexture.needsUpdate = true

    let exteriorTargetCount = 0
    let fallbackAppliedCount = 0

    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          if (!mat) return

          const textureMat = mat as THREE.Material & {
            map?: THREE.Texture | null
            color?: THREE.Color
            roughness?: number
            needsUpdate: boolean
            name?: string
          }

          const meshName = (mesh.name || "").toLowerCase()
          const materialName = (textureMat.name || "").toLowerCase()
          const isInterior =
            meshName.includes("interior") ||
            materialName.includes("interior")
          const isExteriorTarget =
            meshName === "camisa_exterior" ||
            materialName === "camisa_exterior" ||
            meshName.includes("camisa_exterior") ||
            materialName.includes("camisa_exterior") ||
            meshName.includes("exterior") ||
            materialName.includes("exterior")

          // Keep inner layer plain, without UV texture.
          if (isInterior) {
            if (textureMat.color) {
              textureMat.color.setHex(0xffffff)
            }
            if (typeof textureMat.roughness === "number") {
              textureMat.roughness = 1
            }
            if (textureMat.map === appliedTextureRef.current) {
              textureMat.map = null
            }
            textureMat.needsUpdate = true
            return
          }

          if (isExteriorTarget) {
            if (textureMat.color) {
              // Neutral base color so the map is shown with exact UV colors.
              textureMat.color.setHex(0xffffff)
            }
            textureMat.map = nextTexture
            textureMat.needsUpdate = true
            exteriorTargetCount += 1
          }
        })
      }
    })

    // Fallback: if no explicit Camisa_Exterior match was found, apply to all non-interior meshes.
    if (exteriorTargetCount === 0) {
      clonedScene.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return
        const mesh = child as THREE.Mesh
        const meshName = (mesh.name || "").toLowerCase()
        if (meshName.includes("interior")) return

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          if (!mat) return
          const textureMat = mat as THREE.Material & {
            map?: THREE.Texture | null
            color?: THREE.Color
            needsUpdate: boolean
            name?: string
          }
          const materialName = (textureMat.name || "").toLowerCase()
          if (materialName.includes("interior")) return

          if (textureMat.color) {
            textureMat.color.setHex(0xffffff)
          }
          textureMat.map = nextTexture
          textureMat.needsUpdate = true
          fallbackAppliedCount += 1
        })
      })
    }

    if (exteriorTargetCount === 0 && fallbackAppliedCount === 0) {
      console.warn("[TShirtPreview3D] No se encontro destino para la textura UV en el modelo.")
    }

    if (appliedTextureRef.current && appliedTextureRef.current !== nextTexture) {
      appliedTextureRef.current.dispose()
    }
    appliedTextureRef.current = nextTexture
    onReady?.()
  }, [clonedScene, gl, onReady, textureCanvas, textureRevision])

  useEffect(() => {
    return () => {
      if (appliedTextureRef.current) {
        appliedTextureRef.current.dispose()
        appliedTextureRef.current = null
      }
    }
  }, [])

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  )
}

useGLTF.preload("/models/CamisaCuelloRedondo.glb")

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7c3aed" wireframe />
    </mesh>
  )
}

interface TShirtPreview3DProps {
  bodyColor: string
  textureCanvas?: HTMLCanvasElement | null
  textureRevision?: number
}

export function TShirtPreview3D({ bodyColor, textureCanvas, textureRevision = 0 }: TShirtPreview3DProps) {
  const [isModelReady, setIsModelReady] = useState(false)
  const [isLoadingTexture, setIsLoadingTexture] = useState(false)
  const prevTextureRevisionRef = useRef<number>(-1)
  const textureLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [displayedTextureRevision, setDisplayedTextureRevision] = useState(0)
  
  const handleModelReady = useCallback(() => {
    setIsModelReady(true)
    setDisplayedTextureRevision(textureRevision)
    prevTextureRevisionRef.current = textureRevision
  }, [textureRevision])
  
  // Track texture loading state to show spinner when texture updates (but not on first load)
  useEffect(() => {
    if (textureRevision !== prevTextureRevisionRef.current) {
      // Only show spinner if prevTextureRef was already set (not first load)
      if (prevTextureRevisionRef.current >= 0) {
        setIsLoadingTexture(true)
      }
      // Clear any pending timeout
      if (textureLoadTimeoutRef.current) {
        clearTimeout(textureLoadTimeoutRef.current)
      }
      // Wait a bit then update displayed texture (with timeout fallback)
      textureLoadTimeoutRef.current = setTimeout(() => {
        setDisplayedTextureRevision(textureRevision)
        setIsLoadingTexture(false)
      }, 180)
      prevTextureRevisionRef.current = textureRevision
    }
  }, [textureRevision])
  
  useEffect(() => {
    return () => {
      if (textureLoadTimeoutRef.current) {
        clearTimeout(textureLoadTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="relative h-full w-full" style={{ minHeight: 300 }}>
      {!isModelReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
            <span className="text-sm font-medium text-foreground">Cargando modelo 3D...</span>
          </div>
        </div>
      )}
      {isLoadingTexture && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-lg">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-secondary border-t-primary" />
            <span className="text-xs font-medium text-foreground">Actualizando textura...</span>
          </div>
        </div>
      )}
      <Canvas
        camera={{ position: [0, 0, 0.7], fov: 55 }}
        gl={{ preserveDrawingBuffer: false, antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[bodyColor]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />
        <directionalLight position={[-3, 3, -3]} intensity={0.15} />
        <Suspense fallback={<LoadingFallback />}>
          <TShirtModel bodyColor={bodyColor} textureCanvas={textureCanvas} textureRevision={displayedTextureRevision} onReady={handleModelReady} />
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={0.5}
          maxDistance={1}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.5}
        />
      </Canvas>
      </div>
    )
}
