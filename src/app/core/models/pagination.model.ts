export interface Pagination {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}
