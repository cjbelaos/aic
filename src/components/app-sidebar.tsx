"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Building2,
  Cpu,
  ShoppingCart,
  TrendingUp,
  ClipboardList,
  Settings,
  Ruler,
  FileText,
  UserCog,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navInventory = [
  { title: "Products", href: "/dashboard/products", icon: Package },
  {
    title: "Product Categories",
    href: "/dashboard/product-categories",
    icon: Ruler,
  },
  { title: "Product Units", href: "/dashboard/product-units", icon: Ruler },
  { title: "Customers", href: "/dashboard/customers", icon: Users },
  {
    title: "Customer Prices",
    href: "/dashboard/customer-prices",
    icon: TrendingUp,
  },
  { title: "Suppliers", href: "/dashboard/suppliers", icon: Building2 },
  { title: "Machines", href: "/dashboard/machines", icon: Cpu },
  { title: "Quotations", href: "/dashboard/quotations", icon: FileText },
];

const navOrders = [
  {
    title: "Purchase Orders",
    href: "/dashboard/#",
    icon: ShoppingCart,
  },
  { title: "Sales Orders", href: "/dashboard/#", icon: TrendingUp },
  {
    title: "Machine Orders",
    href: "/dashboard/#",
    icon: ClipboardList,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo / Brand header ───────────────────────────────────── */}
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-2 py-3 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo.png"
            alt="AIC Logo"
            width={32}
            height={32}
            className="shrink-0 object-contain"
          />
          <span className="font-bold text-base leading-tight tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            AIC Dashboard
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Main ──────────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip="Dashboard"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Inventory ─────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Inventory</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navInventory.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Administration ───────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/dashboard/users")}
                  tooltip="User Management"
                >
                  <Link href="/dashboard/users">
                    <UserCog />
                    <span>User Management</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Orders ───────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Orders</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navOrders.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link href="#">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
