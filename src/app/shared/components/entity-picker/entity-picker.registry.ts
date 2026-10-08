import { leaseRef } from '../../pipes/lease-ref.pipe';
import { Injectable, inject } from '@angular/core';
import { map, of, throwError } from 'rxjs';
import { EntityPickerConfig, EntityRow } from './entity-picker.models';
import { UsersService } from '../../../features/users/users.service';
import { UserPreview } from '../../../features/users/models/user.models';
import { HousingService } from '../../../features/housing/housing.service';
import { BuildingPreview } from '../../../features/housing/models/housing.models';
import { TenantsService } from '../../../features/tenants/tenants.service';
import { LeasePreview, TenantPreview } from '../../../features/tenants/models/tenant.models';
import { CatalogAdminService } from '../../../features/ecommerce/catalog-admin.service';
import { CustomerGroup } from '../../../features/ecommerce/models/catalog.models';
import { CommerceService } from '../../../features/ecommerce/commerce.service';
import { AddressesService } from '../../../features/addresses/addresses.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import {
  CountyOption,
  SubCountyOption,
  TownOption,
  EstateAreaOption,
  StreetRoadOption,
  WardOption
} from '../../../features/addresses/models/address.models';
import { PaginatedResult } from '../../../core/models/pagination.model';

const dash = (value?: string | number | null): string => (value === null || value === undefined || value === '' ? '-' : String(value));

/**
 * The address reference endpoints answer with a whole array — the county list is
 * 47 rows and the city list not much longer — while the picker speaks in pages.
 * Wrapping is honest here precisely because the filtering already happened in the
 * database: the `name` the operator typed went to the server.
 */
function asSinglePage<T>(items: T[]): PaginatedResult<T> {
  return {
    items,
    pagination: {
      page: 0,
      size: items.length,
      totalElements: items.length,
      totalPages: 1,
      isFirst: true,
      isLast: true
    }
  };
}

/**
 * One picker config per entity, so the "search by the fields a human knows"
 * experience is written once and reused everywhere that id is required.
 */
@Injectable({ providedIn: 'root' })
export class EntityPickerRegistry {
  private readonly users = inject(UsersService);
  private readonly housing = inject(HousingService);
  private readonly tenants = inject(TenantsService);
  private readonly catalog = inject(CatalogAdminService);
  private readonly commerce = inject(CommerceService);
  private readonly addresses = inject(AddressesService);
  private readonly context = inject(ActiveContextService);

  readonly user: EntityPickerConfig<number> = {
    title: 'Find a user',
    fields: [
      { key: 'firstName', label: 'First name' },
      { key: 'lastName', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'phoneNumber', label: 'Phone number' },
      { key: 'nationalId', label: 'National ID' },
      { key: 'userUid', label: 'Unitwise ID' }
    ],
    metaHeadings: ['Phone', 'National ID'],
    search: (params) => this.users.getUsers(params),
    toRow: (item) => {
      const user = item as UserPreview;
      return {
        id: user.id,
        label: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || `User #${user.id}`,
        hint: user.email ?? null,
        meta: [dash(user.phoneNumber), dash(user.nationalIdNumber)]
      } satisfies EntityRow<number>;
    },
    resolve: (id) => this.users.getUserById(id).pipe(
      map((user) => ({
        id: user.id,
        label: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || `User #${user.id}`,
        hint: user.email ?? null
      }))
    )
  };

  readonly building: EntityPickerConfig<number> = {
    title: 'Find a building',
    fields: [
      { key: 'name', label: 'Building name' },
      { key: 'registrationNumber', label: 'Registration no.' }
      // No agency id field: the search is already scoped to the operator's agency,
      // and nobody should have to know an id to type it (§28).
    ],
    metaHeadings: ['Agency', 'Rooms'],
    // Scoped like the lists (§30.6): the platform-wide search needs _ALL, and an
    // agency admin asking it gets a 403 instead of their own buildings.
    search: (params) => this.context.can(PermissionConstants.BUILDING_READ_ALL)
      ? this.housing.searchBuildings(params)
      : this.context.agencyId() !== null
        ? this.housing.getBuildingsForAgency(this.context.agencyId()!, params)
        : this.housing.getMyBuildings(params),
    toRow: (item) => {
      const building = item as BuildingPreview;
      return {
        id: building.id,
        label: building.name,
        hint: [building.address?.town, building.address?.county].filter(Boolean).join(', ') || null,
        meta: [dash(building.agency?.name), dash(building.totalRoomCount)]
      } satisfies EntityRow<number>;
    }
  };

  readonly tenant: EntityPickerConfig<number> = {
    title: 'Find a tenant',
    fields: [
      { key: 'firstName', label: 'First name' },
      { key: 'lastName', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'phoneNumber', label: 'Phone number' },
      { key: 'nationalId', label: 'National ID' },
      { key: 'userUid', label: 'Unitwise ID' }
    ],
    metaHeadings: ['Room', 'Building'],
    /*
     * Where a tenant search looks, narrowest first: the building in context, then
     * its agency ("Show all in …"), and the platform-wide search only for a
     * reader of every tenant with no agency chosen. An agency admin searching
     * globally is refused by the server, so it is never attempted: without an
     * agency the search says what to choose instead.
     */
    search: (params, widened) => {
      const agencyId = this.context.agencyId();
      const buildingId = this.context.buildingId();
      if (agencyId !== null && buildingId !== null && !widened) {
        return this.tenants.getTenantsForBuilding(agencyId, buildingId, params);
      }
      if (agencyId !== null) {
        return this.tenants.getTenantsForAgency(agencyId, params);
      }
      if (this.context.can(PermissionConstants.TENANT_READ_ALL)) {
        return this.tenants.searchTenants(params);
      }
      return throwError(() => new Error('Choose an agency in the switcher to search its tenants.'));
    },
    scope: (widened) => {
      const active = this.context.active();
      if (active.agencyId === null) {
        return null;
      }
      if (active.buildingId !== null && !widened) {
        return { noun: 'tenants', label: active.buildingName ?? 'this building', widerLabel: active.agencyName ?? 'the agency' };
      }
      return { noun: 'tenants', label: active.agencyName ?? 'this agency', widerLabel: null };
    },
    toRow: (item) => {
      const tenant = item as TenantPreview;
      return {
        id: tenant.id,
        label: [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`,
        hint: tenant.email ?? tenant.phoneNumber ?? null,
        meta: [dash(tenant.roomName ?? tenant.roomNumber), dash(tenant.buildingName)],
        item: tenant
      } satisfies EntityRow<number>;
    }
  };

  readonly lease: EntityPickerConfig<number> = {
    title: 'Find a lease',
    fields: [
      { key: 'leaseNumber', label: 'Lease number' },
      { key: 'tenantName', label: 'Tenant name' },
      { key: 'roomName', label: 'Room name' }
    ],
    metaHeadings: ['Room', 'Status'],
    search: (params) => {
      const agencyId = this.context.agencyId();
      const buildingId = this.context.buildingId();
      if (agencyId === null || this.context.can(PermissionConstants.LEASE_AGREEMENT_READ_ALL)) {
        return this.tenants.searchLeases(params);
      }

      return buildingId !== null
        ? this.tenants.getLeasesForBuilding(agencyId, buildingId, params)
        : this.tenants.getLeasesForAgency(agencyId, params);
    },
    toRow: (item) => {
      const lease = item as LeasePreview;
      return {
        id: lease.id,
        label: leaseRef(lease.leaseNumber, lease.id),
        hint: lease.tenantName ?? null,
        meta: [dash(lease.roomName ?? lease.roomNumber), dash(lease.status)]
      } satisfies EntityRow<number>;
    },
    resolve: (id) => this.tenants.getLease(id).pipe(
      map((lease) => ({
        id: lease.id,
        label: leaseRef(lease.leaseNumber, lease.id),
        hint: lease.tenantName ?? null
      }))
    )
  };

  readonly customerGroup: EntityPickerConfig<number> = {
    title: 'Find a customer group',
    fields: [{ key: 'type', label: 'Type' }],
    metaHeadings: ['Members'],
    search: (params) => this.catalog.getCustomerGroups(params),
    toRow: (item) => {
      const group = item as CustomerGroup;
      return {
        id: group.id,
        label: group.name,
        hint: group.description ?? null,
        meta: [dash(group.memberCount)]
      } satisfies EntityRow<number>;
    },
    resolve: (id) => this.catalog.getCustomerGroup(id).pipe(
      map((group) => ({ id: group.id, label: group.name, hint: group.description ?? null }))
    )
  };

  /**
   * Agencies the operator can see.
   *
   * `GET /v1/agencies` is `AGENCY_READ_ALL` — a super-admin listing of every
   * agency on the platform — so pointing every caller at it answered 403 for the
   * agency admins who make up most of them. The endpoint follows the permission,
   * exactly as the agency list page already does: the platform list for a super
   * admin, `/user-agencies` for everyone else.
   */
  readonly agency: EntityPickerConfig<number> = {
    title: 'Find an agency',
    fields: [
      { key: 'name', label: 'Agency name' },
      { key: 'registrationNumber', label: 'Registration no.' },
      { key: 'ownerEmail', label: 'Owner email' }
    ],
    metaHeadings: ['Owner', 'Buildings'],
    search: (params) => this.context.can(PermissionConstants.AGENCY_READ_ALL)
      ? this.housing.searchAgencies(params)
      : this.housing.getMyAgencies(params),
    toRow: (item) => {
      const agency = item as { id: number; name: string; registrationNumber?: string | null; ownerName?: string | null; buildingCount?: number | null };
      return {
        id: agency.id,
        label: agency.name,
        hint: agency.registrationNumber ?? null,
        meta: [dash(agency.ownerName), dash(agency.buildingCount)]
      } satisfies EntityRow<number>;
    },
    resolve: (id) => this.housing.getAgency(id).pipe(
      map((agency) => ({ id: agency.id, label: agency.name, hint: agency.registrationNumber ?? null }))
    )
  };

  readonly address: EntityPickerConfig<number> = {
    title: 'Find an address',
    fields: [
      { key: 'county', label: 'County' },
      { key: 'subCounty', label: 'Sub-county' },
      { key: 'ward', label: 'Ward' },
      { key: 'postalCode', label: 'Postal code' }
    ],
    metaHeadings: ['County', 'Postal code'],
    search: (params) => this.addresses.getAddresses(params),
    toRow: (item) => {
      const address = item as { id: number; ward?: string | null; subCounty?: string | null; town?: string | null; estateArea?: string | null; county?: string | null; postalCode?: string | null };
      return {
        id: address.id,
        // Smallest unit first, matching how app-address-preview writes it.
        label: [address.estateArea, address.town, address.ward, address.subCounty].filter(Boolean).join(', ') || `Address #${address.id}`,
        hint: address.town ?? address.ward ?? null,
        meta: [dash(address.county), dash(address.postalCode)]
      } satisfies EntityRow<number>;
    }
  };

  /*
   * Places are picked, never typed.
   *
   * Every consumer — agency search, building search, an address form — sends the
   * *name*, so these configs are keyed by name rather than id: what the picker
   * writes into the control is exactly what the API expects. Typing them by hand
   * is how "Nairobi", "nairobi" and "Nairobi County" end up as three different
   * filters that each match a different slice of the table.
   */
  readonly county: EntityPickerConfig<number> = {
    title: 'Find a county',
    fields: [{ key: 'name', label: 'County name' }],
    // No code column: the county code is a registry detail for the super admin, meaningless to someone placing an address.
    search: (params) => this.addresses.getCounties(params['name'] as string | undefined).pipe(map(asSinglePage)),
    toRow: (item) => {
      const county = item as CountyOption;
      return { id: county.id, label: county.name, hint: null } satisfies EntityRow<number>;
    },
    resolve: (id) => this.addresses.getCounty(id).pipe(
      map((county) => ({ id: county.id, label: county.name, hint: null }))
    )
  };


  /**
   * Sub-counties and wards, scoped by their parent.
   *
   * Both are methods rather than fields because neither is a flat list: a ward
   * belongs to a sub-county and a sub-county to a county, and offering all of
   * Kenya's wards in one picker would be a search through four thousand rows to
   * find one of eight.
   *
   * No parent column: every row is inside the parent already picked above, so
   * a column repeating it on each row says nothing.
   */
  subCountiesIn(countyId: number): EntityPickerConfig<number> {
    return {
      title: 'Find a sub-county',
      fields: [{ key: 'name', label: 'Sub-county name' }],
      search: (params) => this.addresses.getSubCountiesByCounty(countyId, params['name'] as string | undefined)
        .pipe(map(asSinglePage)),
      toRow: (item) => {
        const subCounty = item as SubCountyOption;
        return {
          id: subCounty.id,
          label: subCounty.name,
          // Every row shares the county just chosen above, so it is not repeated per row.
          hint: null
        } satisfies EntityRow<number>;
      },
      resolve: (id) => this.addresses.getSubCounty(id).pipe(
        map((subCounty) => ({ id: subCounty.id, label: subCounty.name, hint: null }))
      )
    };
  }

  /** Wards of one sub-county, or of the whole county when none is chosen yet. */
  wardsIn(subCountyId: number | null, countyId: number | null): EntityPickerConfig<number> {
    return {
      title: 'Find a ward',
      fields: [{ key: 'name', label: 'Ward name' }],
      search: (params) => {
        const name = params['name'] as string | undefined;
        const source = subCountyId !== null
          ? this.addresses.getWardsBySubCounty(subCountyId, name)
          : countyId !== null
            ? this.addresses.getWardsByCounty(countyId, name)
            : of([] as WardOption[]);

        return source.pipe(map(asSinglePage));
      },
      toRow: (item) => {
        const ward = item as WardOption;
        return {
          id: ward.id,
          label: ward.name,
          // Only a county-wide search mixes sub-counties; within one, they all match.
          hint: subCountyId === null ? ward.subCountyName ?? null : null
        } satisfies EntityRow<number>;
      },
      resolve: (id) => this.addresses.getWard(id).pipe(
        map((ward) => ({ id: ward.id, label: ward.name, hint: null }))
      )
    };
  }

  /** Estates/areas of one town. */
  estateAreasIn(townId: number): EntityPickerConfig<number> {
    return {
      title: 'Find an estate or area',
      fields: [{ key: 'name', label: 'Estate/area name' }],
      search: (params) => this.addresses.getEstateAreasByTown(townId, params['name'] as string | undefined).pipe(map(asSinglePage)),
      toRow: (item) => {
        const estate = item as EstateAreaOption;
        return { id: estate.id, label: estate.name, hint: null } satisfies EntityRow<number>;
      },
      resolve: (id) => this.addresses.getEstateArea(id).pipe(
        map((estate) => ({ id: estate.id, label: estate.name, hint: null }))
      )
    };
  }

  /** Streets/roads of one estate/area — the last level of the chain. */
  streetRoadsIn(estateAreaId: number): EntityPickerConfig<number> {
    return {
      title: 'Find a street or road',
      fields: [{ key: 'name', label: 'Street/road name' }],
      search: (params) => this.addresses.getStreetRoadsByEstateArea(estateAreaId, params['name'] as string | undefined).pipe(map(asSinglePage)),
      toRow: (item) => {
        const street = item as StreetRoadOption;
        return { id: street.id, label: street.name, hint: null } satisfies EntityRow<number>;
      },
      resolve: (id) => this.addresses.getStreetRoad(id).pipe(
        map((street) => ({ id: street.id, label: street.name, hint: null }))
      )
    };
  }

  /** Towns/localities of one ward. */
  townsIn(wardId: number): EntityPickerConfig<number> {
    return {
      title: 'Find a town or locality',
      fields: [{ key: 'name', label: 'Town/locality name' }],
      search: (params) => this.addresses.getTownsByWard(wardId, params['name'] as string | undefined).pipe(map(asSinglePage)),
      toRow: (item) => {
        const town = item as TownOption;
        return {
          id: town.id,
          label: town.name,
          hint: null
        } satisfies EntityRow<number>;
      },
      resolve: (id) => this.addresses.getTown(id).pipe(
        map((town) => ({ id: town.id, label: town.name, hint: null }))
      )
    };
  }


  /*
   * Name-keyed variants, for the one DTO that still stores free text: an ecommerce
   * delivery address has no registry FK, because a customer may be shipping
   * somewhere the registry does not cover.
   */
  readonly countyName: EntityPickerConfig<string> = {
    title: 'Find a county',
    fields: [{ key: 'name', label: 'County name' }],
    search: (params) => this.addresses.getCounties(params['name'] as string | undefined).pipe(map(asSinglePage)),
    toRow: (item) => {
      const county = item as CountyOption;
      return { id: county.name, label: county.name, hint: null } satisfies EntityRow<string>;
    },
    resolve: (name) => of({ id: name, label: name } satisfies EntityRow<string>)
  };


  /**
   * M-Pesa payments not yet attached to an order — the set an operator picks
   * from when reconciling a collection against an order.
   */
  readonly unlinkedPayment: EntityPickerConfig<number> = {
    title: 'Find an unlinked payment',
    fields: [
      { key: 'mpesaReceiptNumber', label: 'M-Pesa receipt' },
      { key: 'phoneNumber', label: 'Phone number' },
      { key: 'minAmount', label: 'Min amount', type: 'number' },
      { key: 'maxAmount', label: 'Max amount', type: 'number' }
    ],
    metaHeadings: ['Amount', 'Completed'],
    search: (params) => this.commerce.searchEligiblePayments(params),
    toRow: (item) => {
      const payment = item as { id: number; mpesaReceiptNumber?: string | null; phoneNumber?: string | null; amount?: number | string | null; completedAt?: string | null };
      return {
        id: payment.id,
        label: payment.mpesaReceiptNumber ?? `Payment #${payment.id}`,
        hint: payment.phoneNumber ?? null,
        meta: [dash(payment.amount), dash(payment.completedAt)]
      } satisfies EntityRow<number>;
    }
  };

  /** Rooms are searched within a building, so the caller supplies the scope. */
  roomsIn(agencyId: number, buildingId: number): EntityPickerConfig<number> {
    return {
      title: 'Find a room',
      fields: [
        { key: 'buildingName', label: 'Building name' },
        { key: 'minRent', label: 'Min rent', type: 'number' },
        { key: 'maxRent', label: 'Max rent', type: 'number' }
      ],
      metaHeadings: ['Rent', 'Status'],
      search: (params) => this.housing.getAvailableRooms({ ...params, agencyId, buildingId }),
      toRow: (item) => {
        const room = item as { id: number; name?: string | null; roomNumber?: number | null; monthlyRent?: number | string | null; status?: string | null };
        return {
          id: room.id,
          label: room.name ?? `Room ${room.roomNumber ?? room.id}`,
          hint: null,
          meta: [dash(room.monthlyRent), dash(room.status)]
        } satisfies EntityRow<number>;
      },
      resolve: () => of(null)
    };
  }
}
