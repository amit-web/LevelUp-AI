"use client";

// ── Next Steps Map ──────────────────────────────────────────────────────────
// An interactive "skill tree" for the related topics returned alongside an
// explanation. The current topic sits in the center; each related idea is a
// draggable node connected to it by an edge. Clicking a node re-runs the
// search for that topic (via the `onSelect` callback), letting the user
// branch through a chain of ideas the same way a game skill tree lets you
// branch through unlocks.
//
// Component tree:
//   NextStepsMap        builds the node/edge graph from (current, related) and
//                        renders the React Flow canvas
//   └── SkillNode        the custom node renderer — center "root" style vs.
//                        branch "leaf" style, plus hover/tap feedback

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";

type SkillNodeData = {
  label: string;
  isRoot: boolean;
  disabled: boolean;
  onSelect: (label: string) => void;
};

function SkillNode({ data }: NodeProps<SkillNodeData>) {
  const { label, isRoot, disabled, onSelect } = data;

  if (isRoot) {
    return (
      <div className="rounded-2xl border border-expert/60 bg-expert/15 px-5 py-3 text-center shadow-[0_0_24px_rgba(167,139,250,0.25)]">
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <p className="text-[10px] uppercase tracking-wide text-expert/80">Now exploring</p>
        <p className="max-w-[180px] truncate text-sm font-semibold text-white">{label}</p>
      </div>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(label)}
        whileHover={disabled ? undefined : { scale: 1.06, y: -2 }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
        className="group flex max-w-[180px] items-center gap-2 rounded-xl border border-edge bg-panel/80 px-4 py-2.5 text-left text-sm text-white/80 shadow-lg transition-colors hover:border-expert/50 hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-expert transition-transform group-hover:translate-x-0.5">→</span>
        <span className="truncate">{label}</span>
      </motion.button>
    </>
  );
}

const nodeTypes = { skill: SkillNode };

/**
 * Lays the root topic and its related topics out in a downward arc, like
 * branches unlocking from a skill tree's trunk, and returns React Flow's
 * node/edge arrays.
 */
function buildLayout(
  current: string,
  related: string[],
  disabled: boolean,
  onSelect: (label: string) => void
): { nodes: Node<SkillNodeData>[]; edges: Edge[] } {
  const ROOT_ID = "__root__";
  const RADIUS_X = 220;
  const RADIUS_Y = 160;

  const nodes: Node<SkillNodeData>[] = [
    {
      id: ROOT_ID,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { label: current, isRoot: true, disabled, onSelect },
      draggable: false,
      selectable: false,
    },
  ];
  const edges: Edge[] = [];

  const count = related.length;
  related.forEach((label, i) => {
    // Spread nodes across a downward arc (~200deg) so branches read left-to-right,
    // rather than stacking straight down or wrapping back over the root.
    const spread = Math.PI * 1.1;
    const angle = -spread / 2 + (count === 1 ? spread / 2 : (spread * i) / (count - 1)) + Math.PI / 2;
    const id = `related-${i}`;
    nodes.push({
      id,
      type: "skill",
      position: { x: Math.cos(angle) * RADIUS_X, y: Math.abs(Math.sin(angle)) * RADIUS_Y + 90 },
      data: { label, isRoot: false, disabled, onSelect },
    });
    edges.push({
      id: `edge-${id}`,
      source: ROOT_ID,
      target: id,
      animated: true,
      style: { stroke: "rgba(167,139,250,0.4)", strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

export function NextStepsMap({
  current,
  related,
  disabled,
  onSelect,
}: {
  current: string;
  related: string[];
  disabled: boolean;
  onSelect: (topic: string) => void;
}) {
  // Rebuild the graph only when the underlying data changes, not on every
  // render (React Flow treats new array identities as layout changes).
  const { nodes, edges } = useMemo(
    () => buildLayout(current, related, disabled, onSelect),
    [current, related, disabled, onSelect]
  );

  if (related.length === 0) return null;

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-edge bg-panel/30">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll
        minZoom={0.6}
        maxZoom={1.25}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.08)" />
      </ReactFlow>
    </div>
  );
}
