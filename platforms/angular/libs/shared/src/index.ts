// Public API Surface of @synergos/shared
export * from './utils/class-names.util';
export * from './utils/form.util';
export { ClickOutsideDirective } from './directives/click-outside.directive';
export { FocusOutDirective } from './directives/focus-out.directive';
export { FocusVisibleDirective } from './directives/focus-visible.directive';
export { LettersOnlyDirective } from './directives/letters-only.directive';
export { NumberOnlyDirective } from './directives/number-only.directive';
export { ScrollIntoViewDirective } from './directives/scroll-into-view.directive';
export { DateFormatPipe } from './pipes/date-format.pipe';
export { KebabCasePipe } from './pipes/kebab-case.pipe';
export { MarkRequiredLabelPipe } from './pipes/mark-required-label.pipe';
export { MaskPipe } from './pipes/mask.pipe';
export { RemoveHtmlTagsPipe } from './pipes/remove-html-tags.pipe';
export { TitleCasePipe } from './pipes/title-case.pipe';
export { FocusManagerService } from './services/focus-manager.service';
export { LiveAnnouncerService } from './services/live-announcer.service';
export { ReducedMotionService } from './services/reduced-motion.service';

// Primitives
export { AlertComponent } from './components/primitives/alert/alert';
export { AvatarComponent } from './components/primitives/avatar/avatar';
export { BadgeComponent } from './components/primitives/badge/badge';
export { ButtonComponent } from './components/primitives/button/button';
export { CheckboxComponent } from './components/primitives/checkbox/checkbox';
export {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingSize,
  type HeadingTone,
} from './components/primitives/heading/heading';
export {
  IconComponent,
  type IconSize,
  type IconTone,
} from './components/primitives/icon/icon';
export { IconButtonComponent } from './components/primitives/icon-button/icon-button';
export { InputComponent } from './components/primitives/input/input';
export { LinkComponent } from './components/primitives/link/link';
export {
  ListComponent,
  type ListDensity,
  type ListItem,
  type ListMarker,
} from './components/primitives/list/list';
export {
  LiveRegionComponent,
  type LiveRegionTone,
} from './components/primitives/live-region/live-region';
export { ProgressComponent } from './components/primitives/progress/progress';
export { RadioComponent } from './components/primitives/radio/radio';
export { RangeSliderComponent } from './components/primitives/range-slider/range-slider';
export {
  SkeletonComponent,
  type SkeletonShape,
} from './components/primitives/skeleton/skeleton';
export { SelectComponent } from './components/primitives/select/select';
export { SpinnerComponent } from './components/primitives/spinner/spinner';
export {
  StatusTagComponent,
  type StatusTagStyle,
  type StatusTagTone,
} from './components/primitives/status-tag/status-tag';
export { StepperComponent } from './components/primitives/stepper/stepper';
export { TextareaComponent } from './components/primitives/textarea/textarea';
export {
  ToggleComponent,
  type ToggleSize,
} from './components/primitives/toggle/toggle';
export { VisuallyHiddenComponent } from './components/primitives/visually-hidden/visually-hidden';

// Compositions
export { AccordionComponent } from './components/compositions/accordion/accordion';
export { CardComponent } from './components/compositions/card/card';
export {
  CarouselComponent,
  type CarouselItem,
  type CarouselItemType,
} from './components/compositions/carousel/carousel';
export {
  DateDisplayComponent,
  type DateDisplayLayout,
} from './components/compositions/date-display/date-display';
export {
  DescriptionListComponent,
  type DescriptionListEmphasis,
  type DescriptionListItem,
  type DescriptionListLayout,
} from './components/compositions/description-list/description-list';
export { DropdownComponent } from './components/compositions/dropdown/dropdown';
export { ModalComponent } from './components/compositions/modal/modal';
export {
  OptionListComponent,
  type OptionListItem,
  type OptionListLayout,
  type OptionSelectionMode,
} from './components/compositions/option-list/option-list';
export { PanelComponent } from './components/compositions/panel/panel';
export { ReadMoreComponent } from './components/compositions/read-more/read-more';
export {
  SegmentedControlComponent,
  type SegmentedControlOption,
} from './components/compositions/segmented-control/segmented-control';
export { TabsComponent } from './components/compositions/tabs/tabs';
export { TooltipComponent } from './components/compositions/tooltip/tooltip';

// Patterns
export {
  DataTableComponent,
  type DataTableAlign,
  type DataTableColumn,
  type DataTableRow,
  type DataTableSort,
  type DataTableSortDirection,
} from './components/patterns/data-table/data-table';
export {
  EmptyStateComponent,
  type EmptyStateAlign,
  type EmptyStateTone,
} from './components/patterns/empty-state/empty-state';
export { GridColumnsComponent, type GridColumnsGap } from './components/patterns/grid-columns/grid-columns';
export { PaginatorComponent } from './components/patterns/paginator/paginator';
export { SectionComponent } from './components/patterns/section/section';
export {
  SocialLinksComponent,
  type SocialLinkItem,
  type SocialLinksLayout,
} from './components/patterns/social-links/social-links';
