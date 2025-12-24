
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, HandPositions, COLORS } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, LANE_X_POSITIONS, LAYER_Y_POSITIONS, LANE_WIDTH } from '../constants';
import Note from './Note';
import Saber from './Saber';

interface GameSceneProps {
  gameStatus: GameStatus;
  audioRef: React.RefObject<HTMLAudioElement>;
  handPositionsRef: React.MutableRefObject<any>; 
  chart: NoteData[];
  backgroundUrl: string | null;
  onNoteHit: (note: NoteData, goodCut: boolean) => void;
  onNoteMiss: (note: NoteData) => void;
  onSongEnd: () => void;
}

const DiffuseBlob: React.FC<{ position: [number, number, number], scale: number, color: string }> = ({ position, scale, color }) => {
    return (
        <mesh position={position}>
            <sphereGeometry args={[scale, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} />
        </mesh>
    );
};

const SilkRoadTrack = () => {
    return (
        <group position={[0, -0.05, -25]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[10, 100]} />
                <meshStandardMaterial color="#ffffff" roughness={1} metalness={0} transparent opacity={0.4} />
            </mesh>
            
            {LANE_X_POSITIONS.map((x, i) => (
                <group key={i} position={[x, 0.01, 0]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[LANE_WIDTH * 0.95, 100]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                        <planeGeometry args={[0.08, 100]} />
                        <meshBasicMaterial color={COLORS.ink} transparent opacity={0.2} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                        <planeGeometry args={[0.01, 100]} />
                        <meshBasicMaterial color={i % 2 === 0 ? COLORS.glowRed : COLORS.glowCyan} transparent opacity={0.4} />
                    </mesh>
                </group>
            ))}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 25]}>
                <planeGeometry args={[LANE_WIDTH * 5, 1.2]} />
                <meshBasicMaterial color={COLORS.ink} transparent opacity={0.05} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 25]}>
                <planeGeometry args={[LANE_WIDTH * 5, 0.04]} />
                <meshBasicMaterial color="#c02c38" transparent opacity={0.8} />
            </mesh>
        </group>
    );
};

const BackgroundLayer: React.FC<{ url: string | null }> = ({ url }) => {
    // If no URL, we show basic blobs. If URL, we show the image plane.
    const texture = url ? useTexture(url) : null;
    
    if (texture) {
        return (
            <mesh position={[0, 10, -50]}>
                <planeGeometry args={[80, 45]} />
                <meshBasicMaterial map={texture} transparent opacity={0.8} />
            </mesh>
        );
    }

    return (
        <group position={[0, 0, -45]}>
            <DiffuseBlob position={[-30, 10, -5]} scale={15} color="#ffcfd2" />
            <DiffuseBlob position={[25, 15, -10]} scale={20} color="#cfdcff" />
            <DiffuseBlob position={[-15, -10, 5]} scale={25} color="#e2ffcf" />
            <DiffuseBlob position={[10, -5, 0]} scale={12} color="#fff4cf" />
            <DiffuseBlob position={[0, 25, -20]} scale={30} color="#f4cfff" />
        </group>
    );
};

const GameScene: React.FC<GameSceneProps> = ({ 
    gameStatus, 
    audioRef, 
    handPositionsRef, 
    chart,
    backgroundUrl,
    onNoteHit,
    onNoteMiss,
    onSongEnd
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const activeNotesRef = useRef<NoteData[]>([]);
  const nextNoteIndexRef = useRef(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  const vecA = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    activeNotesRef.current = [];
    nextNoteIndexRef.current = 0;
  }, [chart, gameStatus]);

  useFrame((state) => {
    if (gameStatus !== GameStatus.PLAYING || !audioRef.current) return;

    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / NOTE_SPEED;
    while (nextNoteIndexRef.current < chart.length) {
      const nextNote = chart[nextNoteIndexRef.current];
      if (nextNote.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(nextNote);
        nextNoteIndexRef.current++;
      } else break;
    }

    const hands = handPositionsRef.current as HandPositions;
    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
        const note = activeNotesRef.current[i];
        if (note.hit || note.missed) continue;

        const currentZ = PLAYER_Z - ((note.time - time) * NOTE_SPEED);

        if (currentZ > MISS_Z) {
            note.missed = true;
            onNoteMiss(note);
            activeNotesRef.current.splice(i, 1);
            continue;
        }

        if (currentZ > PLAYER_Z - 1.2 && currentZ < PLAYER_Z + 0.6) {
            const handPos = note.type === 'left' ? hands.left : hands.right;
            if (handPos) {
                 const notePos = vecA.set(LANE_X_POSITIONS[note.lineIndex], LAYER_Y_POSITIONS[note.lineLayer], currentZ);
                 if (handPos.distanceTo(notePos) < 0.9) {
                     note.hit = true;
                     note.hitTime = time;
                     onNoteHit(note, true);
                     activeNotesRef.current.splice(i, 1);
                 }
            }
        }
    }
  });

  const visibleNotes = useMemo(() => {
     return chart.filter(n => !n.missed && (!n.hit || (currentTime - (n.hitTime || 0) < 0.3)) && Math.abs(n.time - currentTime) < 4.5);
  }, [chart, currentTime]);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 2.2, 5]} fov={50} />
      <color attach="background" args={[COLORS.track]} />
      <fog attach="fog" args={[COLORS.track, 40, 70]} />
      
      <ambientLight intensity={2.0} />
      <directionalLight position={[10, 20, 10]} intensity={1.0} />

      <BackgroundLayer url={backgroundUrl} />

      <SilkRoadTrack />

      <Saber type="left" positionRef={{current: handPositionsRef.current.left}} velocityRef={{current: handPositionsRef.current.leftVelocity}} />
      <Saber type="right" positionRef={{current: handPositionsRef.current.right}} velocityRef={{current: handPositionsRef.current.rightVelocity}} />

      {visibleNotes.map(note => (
          <Note key={note.id} data={note} zPos={PLAYER_Z - ((note.time - currentTime) * NOTE_SPEED)} currentTime={currentTime} />
      ))}
    </>
  );
};

export default GameScene;
