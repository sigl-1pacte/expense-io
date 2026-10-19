// Noyau partagé : l'acteur d'une requête, produit par le module iam et
// consommé par les autres modules. Aucune logique ici.
export type Role = 'employee' | 'manager' | 'hr_admin'

export interface Actor {
  id: string
  companyId: string
  role: Role
  managerId: string | null
}
