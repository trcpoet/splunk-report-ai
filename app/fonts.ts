import { Schibsted_Grotesk, Martian_Mono } from "next/font/google";

// The app's two typefaces, shared by the root layout and the global error
// screen (which replaces the layout and so needs them on its own <body>).

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted-grotesk",
  subsets: ["latin"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
});

export const fontVariables = `${schibstedGrotesk.variable} ${martianMono.variable}`;
