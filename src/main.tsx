import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

const root = document.getElementById("root");
if (!root) throw new Error("élément #root manquant");
createRoot(root).render(<App />);
