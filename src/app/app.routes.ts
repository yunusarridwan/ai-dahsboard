import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { DocumentValidationComponent } from './pages/document-validation/document-validation.component';
import { DocumentComparisonComponent } from './pages/document-comparison/document-comparison.component';
import { AiOpsComponent } from './pages/ai-ops/ai-ops.component';
import { ResultDetailComponent } from './pages/result-detail/result-detail.component';
import { ContractVerificationComponent } from './pages/contract-verification/contract-verification.component';
import { ContractListComponent } from './pages/contract-list/contract-list.component';
import { LoginComponent } from './pages/login/login.component';
import { LegalContractListComponent } from './pages/legal-contract/legal-contract-list.component';
import { LegalContractFormComponent } from './pages/legal-contract/legal-contract-form.component';
import { LegalContractPreviewComponent } from './pages/legal-contract/legal-contract-preview.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '',                                    redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',                           component: DocumentValidationComponent      },
      { path: 'dashboard/result/:score',             component: ResultDetailComponent            },
      { path: 'comparison',                          component: DocumentComparisonComponent      },
      { path: 'ai-ops',                              component: AiOpsComponent                   },
      { path: 'contract-verification',               component: ContractVerificationComponent    },
      { path: 'comparison/verification-history',     component: ContractListComponent            },
      { path: 'legal-contract',                      component: LegalContractListComponent       },
      { path: 'legal-contract/create',               component: LegalContractFormComponent       },
      { path: 'legal-contract/:id/preview',          component: LegalContractPreviewComponent    },
      { path: 'legal-contract/:id',                  component: LegalContractFormComponent       },
      { path: 'settings',                            component: DocumentValidationComponent      },
      { path: '**',                                  redirectTo: 'dashboard'                     },
    ]
  }
];
