import { Component, Input } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

/**
 * Temporary scaffold used by every feature's route file until that feature's
 * real pages exist (feature/auth, feature/posts, feature/users). Not a
 * design-system component, just a placeholder so routing can be wired and
 * tested end to end before there is anything real to navigate to.
 */
@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ label }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h1>{{ label }}</h1>
    </ion-content>
  `,
})
export class PlaceholderPageComponent {
  @Input() label = '';
}
