import localFont from "next/font/local";

// The app's two typefaces, shared by the root layout and the global error
// screen (which replaces the layout and so needs them on its own <body>). The
// files are in the repo, so a build needs no access to Google Fonts. Both are
// under the SIL Open Font License (app/font-files/).

const schibstedGrotesk = localFont({
  src: "./font-files/schibsted-grotesk-latin-wght-normal.woff2",
  variable: "--font-schibsted-grotesk",
  weight: "400 900",
  style: "normal",
});

const martianMono = localFont({
  src: "./font-files/martian-mono-latin-wght-normal.woff2",
  variable: "--font-martian-mono",
  weight: "100 800",
  style: "normal",
});

export const fontVariables = `${schibstedGrotesk.variable} ${martianMono.variable}`;
