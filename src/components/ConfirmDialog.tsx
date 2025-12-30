import { useEffect } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "warning" | "info";
}

export default function ConfirmDialog({
  isOpen,
  title = "确认",
  message,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
  type = "info",
}: ConfirmDialogProps) {
  // 处理 ESC 键关闭
  useEscapeKey(onCancel, !isOpen);

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      confirm: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
      icon: "text-red-500",
    },
    warning: {
      confirm: "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500",
      icon: "text-yellow-500",
    },
    info: {
      confirm: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
      icon: "text-blue-500",
    },
  };

  const styles = typeStyles[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-md w-full mx-4 transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 text-2xl ${styles.icon}`}>
              {type === "danger" && "⚠️"}
              {type === "warning" && "⚠️"}
              {type === "info" && "ℹ️"}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed flex-1">{message}</p>
          </div>
        </div>

        {/* 按钮栏 */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 ${styles.confirm}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

