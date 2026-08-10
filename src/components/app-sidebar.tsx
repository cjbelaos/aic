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
  MapPin,
  BarChart3,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const pathname = usePathname();

  // Determine whether a nav item is active. Items with query-string hrefs
  // (e.g. /dashboard/companies?type=customer) match only when both the base
  // path and the full query string are active.
  const isItemActive = (href: string): boolean => {
    if (href.includes("?")) {
      const [base, query] = href.split("?");
      return (
        pathname === base &&
        typeof window !== "undefined" &&
        window.location.search === `?${query}`
      );
    }
    return pathname.startsWith(href);
  };

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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/products")}
                  tooltip="Products"
                >
                  <Link href="/dashboard/products">
                    <Package />
                    <span>Products</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/product-categories")}
                  tooltip="Product Categories"
                >
                  <Link href="/dashboard/product-categories">
                    <Ruler />
                    <span>Product Categories</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/product-units")}
                  tooltip="Product Units"
                >
                  <Link href="/dashboard/product-units">
                    <Ruler />
                    <span>Product Units</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/machines")}
                  tooltip="Machines"
                >
                  <Link href="/dashboard/machines">
                    <Cpu />
                    <span>Machines</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Contacts & Parties ───────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Contacts & Parties</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Companies (master view) with Customers/Suppliers as
                  filter shortcuts nested underneath */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={
                    pathname === "/dashboard/companies" &&
                    isItemActive("/dashboard/companies")
                  }
                  tooltip="Companies"
                >
                  <Link href="/dashboard/companies">
                    <Building2 />
                    <span>Companies</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={isItemActive(
                        "/dashboard/companies?type=customer",
                      )}
                    >
                      <Link href="/dashboard/companies?type=customer">
                        <Users />
                        <span>Customers</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={isItemActive(
                        "/dashboard/companies?type=supplier",
                      )}
                    >
                      <Link href="/dashboard/companies?type=supplier">
                        <Building2 />
                        <span>Suppliers</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/customer-prices")}
                  tooltip="Customer Prices"
                >
                  <Link href="/dashboard/customer-prices">
                    <TrendingUp />
                    <span>Customer Prices</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Sales ─────────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Sales</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/quotations")}
                  tooltip="Quotations"
                >
                  <Link href="/dashboard/quotations">
                    <FileText />
                    <span>Quotations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/#")}
                  tooltip="Purchase Orders"
                >
                  <Link href="/dashboard/#">
                    <ShoppingCart />
                    <span>Purchase Orders</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/#")}
                  tooltip="Sales Orders"
                >
                  <Link href="/dashboard/#">
                    <TrendingUp />
                    <span>Sales Orders</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/#")}
                  tooltip="Machine Orders"
                >
                  <Link href="/dashboard/#">
                    <ClipboardList />
                    <span>Machine Orders</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/dashboard/user-approvers")}
                  tooltip="User Approvers"
                >
                  <Link href="/dashboard/user-approvers">
                    <ShieldCheck />
                    <span>User Approvers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Travel ────────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Travel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(
                    "/dashboard/field-travel-itinerary",
                  )}
                  tooltip="Field Technician Itinerary"
                >
                  <Link href="/dashboard/field-travel-itinerary">
                    <MapPin />
                    <span>Field Technician Itinerary</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(
                    "/dashboard/fti-summary-report",
                  )}
                  tooltip="FTI Summary Report"
                >
                  <Link href="/dashboard/fti-summary-report">
                    <BarChart3 />
                    <span>FTI Summary Report</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/dashboard/schedule-calendar")}
                  tooltip="Schedule Calendar"
                >
                  <Link href="/dashboard/schedule-calendar">
                    <CalendarDays />
                    <span>Schedule Calendar</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
