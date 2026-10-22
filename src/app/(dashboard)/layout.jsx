import './globals.css';

export const metadata = {
  title: 'StockNow — Inventory Management',
  description: 'Smart Inventory Management with StockNow',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}