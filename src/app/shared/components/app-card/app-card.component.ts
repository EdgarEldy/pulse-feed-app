import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader } from '@ionic/angular/standalone';

/**
 * A thin wrapper around `ion-card` exposing two content-projection slots
 * instead of a fixed set of `@Input()` strings: a `[card-header]` slot
 * (an avatar, title, and timestamp row, say) and a default slot for the
 * card's body. Projection is the simpler API here because the eventual
 * caller, `feature/posts`'s `PostCardComponent`, needs to project
 * structured markup (an author row, post text, an optional image) rather
 * than a couple of plain strings, which `@Input()` alone could not express
 * without `AppCardComponent` growing feature-specific knowledge it should
 * not have.
 *
 * Usage:
 * ```html
 * <app-card>
 *   <div card-header>...</div>
 *   <p>Card body content projected into the default slot.</p>
 * </app-card>
 * ```
 */
@Component({
  selector: 'app-card',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-card.component.html',
  styleUrl: './app-card.component.scss',
})
export class AppCardComponent {}
