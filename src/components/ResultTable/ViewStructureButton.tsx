
interface ViewStructureButtonProps {
  onClick: () => void;
  className?: string;
}

export default function ViewStructureButton({ 
  onClick, 
  className = "" 
}: ViewStructureButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active ${className}`}
      style={{ color: "var(--neu-accent)" }}
      title="查看表结构"
    >
      📐 表设计
    </button>
  );
}

