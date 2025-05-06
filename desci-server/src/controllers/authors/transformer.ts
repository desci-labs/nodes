import { AffiliationGroup2, StartDate } from '../../services/crossRef/types/summary.js';

import { AuthorExperience } from './types.js';

const formatDate = (date: StartDate): string | null => {
  if (!date) return null;
  return `${date.year?.value}/${date.month?.value ?? '01'}/${date.day?.value ?? '01'}`;
};
export function transformOrcidAffiliationToEmployment(affiliations: AffiliationGroup2[]): AuthorExperience[] {
  return affiliations.map((affiliation) => {
    const entry = affiliation['summaries'][0]['employment-summary'];
    const startDate = formatDate(entry['start-date']);
    const endDate = formatDate(entry['end-date']);
    const location = `${entry.organization.address?.city} ${entry.organization.address?.region} ${entry.organization.address.country}`;
    return {
      endDate,
      startDate,
      title: entry['role-title'],
      organisation: {
        location,
        name: entry.organization.name,
        department: entry['department-name'],
      },
    };
  });
}
export function transformOrcidAffiliationToEducation(affiliations: AffiliationGroup2[]): AuthorExperience[] {
  return affiliations.map((affiliation) => {
    const entry = affiliation['summaries'][0]['education-summary'];
    const startDate = formatDate(entry['start-date']);
    const endDate = formatDate(entry['end-date']);
    const location = `${entry.organization.address?.city} ${entry.organization.address?.region} ${entry.organization.address.country}`;
    return {
      endDate,
      startDate,
      title: entry['role-title'],
      organisation: {
        location,
        name: entry.organization.name,
        department: entry['department-name'],
      },
    };
  });
}
