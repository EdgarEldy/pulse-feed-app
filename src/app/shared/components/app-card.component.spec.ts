import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppCardComponent } from './app-card.component';

@Component({
  standalone: true,
  imports: [AppCardComponent],
  template: `
    <app-card>
      <div card-header>Header content</div>
      <p>Body content</p>
    </app-card>
  `,
})
class HostComponent {}

describe('AppCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideIonicAngular()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('projects content into the header slot', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Header content');
  });

  it('projects content into the default body slot', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Body content');
  });
});
