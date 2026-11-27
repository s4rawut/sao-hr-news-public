/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		/** the signed-in admin user (set by middleware on /admin pages) */
		user?: import("./lib/admin/auth").AdminUser;
	}
}
