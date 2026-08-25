"use client";

import { useState } from "react";
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
  Receipt,
  ReceiptText,
  CalendarCheck,
  Truck,
  FileSignature,
  ShieldAlert,
  KeyRound,
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

interface StoredUser {
  userId?: string;
  departmentId?: number;
  userRoleId?: number;
}

function getStoredDepartmentId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser;
    return typeof parsed.departmentId === "number" ? parsed.departmentId : null;
  } catch {
    return null;
  }
}

function getStoredUserRoleId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser;
    return typeof parsed.userRoleId === "number" ? parsed.userRoleId : null;
  } catch {
    return null;
  }
}

export function AppSidebar() {
  const pathname = usePathname();
  const [departmentId] = useState<number | null>(getStoredDepartmentId);
  const [userRoleId] = useState<number | null>(getStoredUserRoleId);
  const canSeeTravel = departmentId === 1;
  const isAdmin = userRoleId === 1;

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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/customer-contracts")}
                  tooltip="Customer Contracts"
                >
                  <Link href="/dashboard/customer-contracts">
                    <FileSignature />
                    <span>Customer Contracts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Sales & Collections ─────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Sales & Collections</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/delivery-releases")}
                  tooltip="Delivery Release"
                >
                  <Link href="/dashboard/delivery-releases">
                    <Truck />
                    <span>Delivery Release</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/contract-releases")}
                  tooltip="Contract Releases"
                >
                  <Link href="/dashboard/contract-releases">
                    <CalendarCheck />
                    <span>Contract Releases</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/contract-analytics")}
                  tooltip="Contract Analytics"
                >
                  <Link href="/dashboard/contract-analytics">
                    <BarChart3 />
                    <span>Contract Analytics</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/customer-contracts")}
                  tooltip="Contract Entitlements"
                >
                  <Link href="/dashboard/customer-contracts">
                    <ShieldAlert />
                    <span>Contract Entitlements</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive("/dashboard/collections")}
                  tooltip="Customer Collections"
                >
                  <Link href="/dashboard/collections">
                    <CalendarCheck />
                    <span>Collections</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
        {/* ── Expenses (all departments) ──────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Expenses</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard/expense-liquidation"}
                  tooltip="Expense Liquidation"
                >
                  <Link href="/dashboard/expense-liquidation">
                    <Receipt />
                    <span>Expense Liquidation</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(
                    "/dashboard/expense-liquidation/history",
                  )}
                  tooltip="Liquidation History"
                >
                  <Link href="/dashboard/expense-liquidation/history">
                    <ReceiptText />
                    <span>Liquidation History</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            {/* ── Admin (userRoleId = 1 only) ──────────────────────── */}
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/dashboard/admin/google-token")}
                      tooltip="Google Token"
                    >
                      <Link href="/dashboard/admin/google-token">
                        <KeyRound />
                        <span>Google Token</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {canSeeTravel && (
          <>
            <SidebarSeparator />
            {/* ── Travel (DepartmentId = 1 only) ────────────────── */}
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
                      isActive={pathname.startsWith(
                        "/dashboard/location-addresses",
                      )}
                      tooltip="Location Addresses"
                    >
                      <Link href="/dashboard/location-addresses">
                        <MapPin />
                        <span>Location Addresses</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
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
