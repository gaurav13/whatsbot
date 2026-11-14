export const BUSINESS_CATEGORIES = [
  { id: 'real_estate', label: 'Real Estate & Property' },
  { id: 'it_software', label: 'IT & Software Agency' },
  { id: 'ecommerce', label: 'E-Commerce & Retail Store' },
  { id: 'healthcare', label: 'Healthcare & Clinic / Doctor' },
  { id: 'gym', label: 'Gym & Fitness Center' },
  { id: 'restaurant', label: 'Restaurant & Food Delivery' },
  { id: 'education', label: 'Education & Coaching Classes' },
  { id: 'travel', label: 'Tour & Travels' },
  { id: 'general', label: 'Other / General Business' },
];

export function normalizeBusinessCategory(value) {
  const id = String(value || '').trim();
  if (BUSINESS_CATEGORIES.some((c) => c.id === id)) return id;
  return 'general';
}

export function businessTypeFromCategory(category) {
  return normalizeBusinessCategory(category) === 'real_estate' ? 'real_estate' : 'it_services';
}

export function categoryLabel(id) {
  return BUSINESS_CATEGORIES.find((c) => c.id === id)?.label || id || 'General';
}

export function normalizeTenantPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits;
}

export function assertValidPhone(phone) {
  const digits = normalizeTenantPhone(phone);
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('A valid phone number is required (10–15 digits).');
  }
  return digits;
}

export function normalizeOptionalEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Enter a valid email address, or leave it blank.');
  }
  return value;
}
