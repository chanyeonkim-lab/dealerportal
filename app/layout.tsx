import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/public-sans';
import './globals.css';
export const metadata:Metadata={title:'Hyundai · Dealer Workspace',description:'Australian dealer sales enablement prototype'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
