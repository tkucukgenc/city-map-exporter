import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';

interface PreviewProps {
    buildingGeos: THREE.BufferGeometry[];
    roadGeos: THREE.BufferGeometry[];
    waterGeos: THREE.BufferGeometry[];
    baseGeo: THREE.BufferGeometry | null;
    heightScale: number;
    waterLevel: number;
    groundOffset: number;
    roadOffset: number;
    waterHeight: number;
    colors: {
        background: string;
        ground: string;
        road: string;
        building: string;
        water: string;
    };
    groupRef: React.RefObject<THREE.Group>;
}

export default function PreviewCanvas({
    buildingGeos,
    roadGeos,
    waterGeos,
    baseGeo,
    heightScale,
    waterLevel,
    groundOffset,
    roadOffset,
    waterHeight,
    colors,
    groupRef
}: PreviewProps) {
    // Stack:
    // 1. Base plate: y=0 to y=waterLevel (foundation slab, ground color)
    // 2. Water: flat at y=waterLevel (blue, only water areas)
    // 3. Roads/Buildings: at y=waterLevel+groundOffset (elevated above water)
    // groundOffset creates a "cliff" between land and water = visual separation!

    const groundTop = waterLevel + groundOffset;

    return (
        <div className="w-full h-full" style={{ backgroundColor: colors.background }}>
            <Canvas shadows camera={{ position: [0, 50, 50], fov: 45 }} dpr={[1, 2]}>
                <color attach="background" args={[colors.background]} />

                <Stage environment="city" intensity={0.5} adjustCamera={1.2}>
                    <group ref={groupRef}>
                        {/* Base Plate — full rectangle foundation */}
                        {baseGeo && (
                            <group scale={[1, waterLevel, 1]}>
                                <mesh geometry={baseGeo} receiveShadow>
                                    <meshStandardMaterial color={colors.ground} roughness={0.9} />
                                </mesh>
                            </group>
                        )}

                        {/* Water — flat surface at base plate top, only water areas */}
                        {waterGeos.length > 0 && waterHeight > 0 && (
                            <group position={[0, waterLevel, 0]} scale={[1, waterHeight, 1]}>
                                {waterGeos.map((geo, i) => (
                                    <mesh key={`w-${i}`} geometry={geo} receiveShadow>
                                        <meshStandardMaterial
                                            color={colors.water}
                                            emissive={colors.water}
                                            emissiveIntensity={0.25}
                                            roughness={0.2}
                                            metalness={0.1}
                                        />
                                    </mesh>
                                ))}
                            </group>
                        )}

                        {/* Roads — elevated above water by groundOffset */}
                        <group position={[0, groundTop, 0]} scale={[1, roadOffset || 0.1, 1]}>
                            {roadGeos.map((geo, i) => (
                                <mesh key={`r-${i}`} geometry={geo} receiveShadow>
                                    <meshStandardMaterial color={colors.road} roughness={0.8} />
                                </mesh>
                            ))}
                        </group>

                        {/* Buildings — on ground top, linked to ground */}
                        <group position={[0, groundTop, 0]} scale={[1, heightScale, 1]}>
                            {buildingGeos.map((geo, i) => (
                                <mesh key={`b-${i}`} geometry={geo} castShadow receiveShadow>
                                    <meshStandardMaterial color={colors.building} roughness={0.4} metalness={0.1} />
                                </mesh>
                            ))}
                        </group>
                    </group>
                </Stage>

                <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} />
            </Canvas>
        </div>
    );
}
