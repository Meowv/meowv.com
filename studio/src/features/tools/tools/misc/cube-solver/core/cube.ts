import {
  CENTER_INDEXES,
  CORNER_COLORS,
  CORNER_FACELETS,
  EDGE_COLORS,
  EDGE_FACELETS,
} from './constants';
import { FACES, type CubeMove, type CubePosition, type Face } from '../types';

interface MoveTable {
  corners: { permutation: readonly number[]; orientation: readonly number[] };
  edges: { permutation: readonly number[]; orientation: readonly number[] };
}

const IDENTITY_CORNERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const IDENTITY_EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const ZERO_CORNERS = [0, 0, 0, 0, 0, 0, 0, 0] as const;
const ZERO_EDGES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

const MOVE_TABLES: Record<Face, MoveTable> = {
  U: {
    corners: { permutation: [3, 0, 1, 2, 4, 5, 6, 7], orientation: ZERO_CORNERS },
    edges: { permutation: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], orientation: ZERO_EDGES },
  },
  R: {
    corners: {
      permutation: [4, 1, 2, 0, 7, 5, 6, 3],
      orientation: [2, 0, 0, 1, 1, 0, 0, 2],
    },
    edges: {
      permutation: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0],
      orientation: ZERO_EDGES,
    },
  },
  F: {
    corners: {
      permutation: [1, 5, 2, 3, 0, 4, 6, 7],
      orientation: [1, 2, 0, 0, 2, 1, 0, 0],
    },
    edges: {
      permutation: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11],
      orientation: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
    },
  },
  D: {
    corners: { permutation: [0, 1, 2, 3, 5, 6, 7, 4], orientation: ZERO_CORNERS },
    edges: { permutation: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], orientation: ZERO_EDGES },
  },
  L: {
    corners: {
      permutation: [0, 2, 6, 3, 4, 1, 5, 7],
      orientation: [0, 1, 2, 0, 0, 2, 1, 0],
    },
    edges: {
      permutation: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11],
      orientation: ZERO_EDGES,
    },
  },
  B: {
    corners: {
      permutation: [0, 1, 3, 7, 4, 5, 2, 6],
      orientation: [0, 0, 1, 2, 0, 0, 2, 1],
    },
    edges: {
      permutation: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7],
      orientation: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
    },
  },
};

export function solvedPosition(): CubePosition {
  return {
    corners: { permutation: [...IDENTITY_CORNERS], orientation: [...ZERO_CORNERS] },
    edges: { permutation: [...IDENTITY_EDGES], orientation: [...ZERO_EDGES] },
  };
}

export function clonePosition(position: CubePosition): CubePosition {
  return {
    corners: {
      permutation: [...position.corners.permutation],
      orientation: [...position.corners.orientation],
    },
    edges: {
      permutation: [...position.edges.permutation],
      orientation: [...position.edges.orientation],
    },
  };
}

function applyQuarterTurn(position: CubePosition, face: Face): CubePosition {
  const table = MOVE_TABLES[face];
  return {
    corners: {
      permutation: table.corners.permutation.map((source) => position.corners.permutation[source]!),
      orientation: table.corners.permutation.map(
        (source, index) =>
          (position.corners.orientation[source]! + table.corners.orientation[index]!) % 3,
      ),
    },
    edges: {
      permutation: table.edges.permutation.map((source) => position.edges.permutation[source]!),
      orientation: table.edges.permutation.map(
        (source, index) =>
          (position.edges.orientation[source]! + table.edges.orientation[index]!) % 2,
      ),
    },
  };
}

export function applyMove(position: CubePosition, move: CubeMove): CubePosition {
  const turns = move.amount === -1 ? 3 : move.amount;
  let next = clonePosition(position);
  for (let index = 0; index < turns; index += 1) next = applyQuarterTurn(next, move.face);
  return next;
}

export function applyMoves(position: CubePosition, moves: readonly CubeMove[]): CubePosition {
  return moves.reduce((state, move) => applyMove(state, move), clonePosition(position));
}

export function isSolved(position: CubePosition): boolean {
  return (
    position.corners.permutation.every((piece, index) => piece === index) &&
    position.corners.orientation.every((orientation) => orientation === 0) &&
    position.edges.permutation.every((piece, index) => piece === index) &&
    position.edges.orientation.every((orientation) => orientation === 0)
  );
}

export function positionsEqual(left: CubePosition, right: CubePosition): boolean {
  return (
    left.corners.permutation.every((value, index) => value === right.corners.permutation[index]) &&
    left.corners.orientation.every((value, index) => value === right.corners.orientation[index]) &&
    left.edges.permutation.every((value, index) => value === right.edges.permutation[index]) &&
    left.edges.orientation.every((value, index) => value === right.edges.orientation[index])
  );
}

export function positionToFacelets(position: CubePosition): Face[] {
  const facelets = Array<Face>(54);
  CENTER_INDEXES.forEach((absoluteIndex, faceIndex) => {
    facelets[absoluteIndex] = FACES[faceIndex]!;
  });

  for (let positionIndex = 0; positionIndex < CORNER_FACELETS.length; positionIndex += 1) {
    const piece = position.corners.permutation[positionIndex]!;
    const orientation = position.corners.orientation[positionIndex]!;
    for (let sticker = 0; sticker < 3; sticker += 1) {
      const target = CORNER_FACELETS[positionIndex]![(sticker + orientation) % 3]!;
      facelets[target] = CORNER_COLORS[piece]![sticker]!;
    }
  }

  for (let positionIndex = 0; positionIndex < EDGE_FACELETS.length; positionIndex += 1) {
    const piece = position.edges.permutation[positionIndex]!;
    const orientation = position.edges.orientation[positionIndex]!;
    for (let sticker = 0; sticker < 2; sticker += 1) {
      const target = EDGE_FACELETS[positionIndex]![(sticker + orientation) % 2]!;
      facelets[target] = EDGE_COLORS[piece]![sticker]!;
    }
  }

  return facelets;
}

export function positionToString(position: CubePosition): string {
  return positionToFacelets(position).join('');
}

export function solvedFacelets(): Face[] {
  return FACES.flatMap((face) => Array<Face>(9).fill(face));
}
