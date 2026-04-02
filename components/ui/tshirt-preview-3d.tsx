"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment, useGLTF } from "@react-three/drei"
import { useRef, useMemo, useEffect, Suspense, useState, useCallback } from "react"
import * as THREE from "three"

interface TShirtModelProps {
  bodyColor: string
  textureUrl?: string
  onReady?: () => void
}

function TShirtModel({ bodyColor, textureUrl, onReady }: TShirtModelProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const { scene } = useGLTF("/models/CamisaCuelloRedondo.glb")

  // Clone the scene so we can safely modify materials without side-effects
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    // Center the model based on its bounding box
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)
    return clone
  }, [scene])

  const overlayTexture = useMemo(() => {
    if (!textureUrl) return null
    const tex = new THREE.TextureLoader().load(textureUrl)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = 16
    return tex
  }, [textureUrl])

  useEffect(() => {
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const stdMat = mat as THREE.MeshStandardMaterial
            // Keep Interior_Negro always black
            if (mesh.name === "Interior_Negro") {
              stdMat.color.setHex(0x000000)
              stdMat.map = null
            } else if (overlayTexture) {
              stdMat.map = overlayTexture
            }
            stdMat.needsUpdate = true
          }
        })
      }
    })
    onReady?.()
  }, [clonedScene, overlayTexture, onReady])

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
  textureUrl?: string
}

export function TShirtPreview3D({ bodyColor, textureUrl }: TShirtPreview3DProps) {
  const [isModelReady, setIsModelReady] = useState(false)
  const [isLoadingTexture, setIsLoadingTexture] = useState(false)
  const prevTextureRef = useRef<string | null>(null) // Use null as sentinel, not undefined
  const textureLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [displayedTextureUrl, setDisplayedTextureUrl] = useState<string | undefined>(undefined)
  
  const handleModelReady = useCallback(() => {
    setIsModelReady(true)
    if (textureUrl) {
      setDisplayedTextureUrl(textureUrl)
      prevTextureRef.current = textureUrl // Mark initial texture as "loaded"
    }
  }, [textureUrl])
  
  // Track texture loading state to show spinner when texture updates (but not on first load)
  useEffect(() => {
    if (textureUrl && textureUrl !== prevTextureRef.current) {
      // Only show spinner if prevTextureRef was already set (not first load)
      if (prevTextureRef.current !== null) {
        setIsLoadingTexture(true)
      }
      // Clear any pending timeout
      if (textureLoadTimeoutRef.current) {
        clearTimeout(textureLoadTimeoutRef.current)
      }
      // Wait a bit then update displayed texture (with timeout fallback)
      textureLoadTimeoutRef.current = setTimeout(() => {
        setDisplayedTextureUrl(textureUrl)
        setIsLoadingTexture(false)
      }, 1500) // Timeout to show new texture or hide spinner
      prevTextureRef.current = textureUrl
    } else if (!textureUrl && prevTextureRef.current !== null) {
      // Texture cleared (blank model) - immediately hide spinner
      setDisplayedTextureUrl(undefined)
      setIsLoadingTexture(false)
      prevTextureRef.current = null
    }
  }, [textureUrl])
  
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
        gl={{ preserveDrawingBuffer: true, antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={[bodyColor]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />
        <directionalLight position={[-3, 3, -3]} intensity={0.15} />
        <Suspense fallback={<LoadingFallback />}>
          <TShirtModel bodyColor={bodyColor} textureUrl={displayedTextureUrl} onReady={handleModelReady} />
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
