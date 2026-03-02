import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';

interface PreviewProps {
    buildingGeos: THREE.BufferGeometry[];
    roadGeos: THREE.BufferGeometry[];
    baseGeo: THREE.BufferGeometry | null;
    heightScale: number;
    baseHeight: number;
    groundThickness: number;
    groupRef: React.RefObject<THREE.Group>;
}

export default function PreviewCanvas({
    buildingGeos,
    roadGeos,
    baseGeo,
    heightScale,
    baseHeight,
    groundThickness,
    groupRef
}: PreviewProps) {
    const { isDark } = useTheme();

    const bgColor = isDark ? '#0f172a' : '#e2e8f0';
    const baseColor = isDark ? '#334155' : '#94a3b8';
    const roadColor = isDark ? '#64748b' : '#475569';
    const buildingColor = isDark ? '#e2e8f0' : '#1e293b';

    return (
        <div className="w-full h-full" style={{ backgroundColor: bgColor }}>
            <Canvas shadows camera={{ position: [0, 50, 50], fov: 45 }} dpr={[1, 2]}>
                <color attach="background" args={[bgColor]} />

                <Stage environment="city" intensity={0.5} adjustCamera={1.2}>
                    <group ref={groupRef}>
                        {/* Base Plate */}
                        {baseGeo && (
                            <group scale={[1, baseHeight, 1]}>
                                <mesh geometry={baseGeo} receiveShadow>
                                    <meshStandardMaterial color={baseColor} roughness={0.9} />
                                </mesh>
                            </group>
                        )}

                        {/* Roads */}
                        <group position={[0, baseHeight, 0]} scale={[1, groundThickness, 1]}>
                            {roadGeos.map((geo, i) => (
                                <mesh key={`r-${i}`} geometry={geo} receiveShadow>
                                    <meshStandardMaterial color={roadColor} roughness={0.8} />
                                </mesh>
                            ))}
                        </group>

                        {/* Buildings */}
                        <group position={[0, baseHeight, 0]} scale={[1, heightScale, 1]}>
                            {buildingGeos.map((geo, i) => (
                                <mesh key={`b-${i}`} geometry={geo} castShadow receiveShadow>
                                    <meshStandardMaterial color={buildingColor} roughness={0.4} metalness={0.1} />
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
