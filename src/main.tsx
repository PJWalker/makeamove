import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/transitions.css";
import "./ui/sounds";
import "./ui/sparkle";
import { App } from "./app/App";

createRoot(document.getElementById("app")!).render(<App />);
