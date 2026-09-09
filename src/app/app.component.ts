import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { ConnectivityService } from './core/network/connectivity.service';
import { OfflineBannerComponent } from './shared/components/offline-banner.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, OfflineBannerComponent],
})
export class AppComponent {
  readonly connectivityService = inject(ConnectivityService);
}
