import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

// Add error boundary for better error handling
try {
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  console.error("Failed to render React app:", error);
  // Show error message in the root element
  root.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #333;
    ">
      <h2 style="color: #e74c3c; margin-bottom: 10px;">应用启动失败</h2>
      <p style="color: #666; margin-bottom: 20px;">${error instanceof Error ? error.message : String(error)}</p>
      <button 
        onclick="location.reload()" 
        style="
          padding: 10px 20px;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        "
      >
        重新加载
      </button>
    </div>
  `;
}
