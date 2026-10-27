import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/** Customer prescription upload: /account/prescriptions */
export class PrescriptionPage extends BasePage {
  readonly uploadButton: Locator;
  readonly fileInput: Locator;
  readonly dropZone: Locator;
  readonly patientNameInput: Locator;
  readonly noteInput: Locator;
  readonly submitButton: Locator;
  readonly prescriptionRows: Locator;
  readonly statusBadges: Locator;
  readonly thumbnails: Locator;
  readonly emptyState: Locator;
  readonly sizeLimitText: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    // 'Upload prescription' stays disabled until a file is chosen.
    this.uploadButton = page.getByRole('button', { name: /Upload prescription/i }).first();
    this.fileInput = page.locator('input[type="file"]');
    this.dropZone = page.getByRole('button', { name: /Drag & drop|click to choose/i }).first();
    this.patientNameInput = page.getByLabel(/Patient name/i).first();
    this.noteInput = page.getByLabel(/Anything we should know/i).first();
    this.submitButton = page.getByRole('button', { name: /Upload|Submit|Send/i }).last();
    this.prescriptionRows = page.locator('.rx-row, .prescription-row, .rx-card');
    this.statusBadges = page.locator('.badge, .status');
    this.thumbnails = page.locator('.rx-thumb img, .prescription-thumb img');
    this.emptyState = page.getByText(/haven't uploaded any prescriptions/i);
    this.sizeLimitText = page.getByText(/8\s?MB/i);
    this.errorMessage = page.locator('.field-error, .form-error, [role="alert"]');
  }

  async open() {
    await this.goto('/account/prescriptions');
  }

  async uploadFile(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
  }
}
