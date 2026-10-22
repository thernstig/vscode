/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IExtensionsWorkbenchService, ExtensionContainers, IExtension as IWorkbenchExtension, ExtensionState } from '../../common/extensions.js';
import * as ExtensionsActions from '../../browser/extensionsActions.js';
import { Extension, ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension,
	DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionIdentifier, InstallOperation, IExtensionTipsService, InstallExtensionResult, getTargetPlatform, IExtensionsControlManifest, UninstallExtensionEvent, Metadata, IAllowedExtensionsService
} from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, ExtensionInstallLocation, IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IPager } from '../../../../../base/common/paging.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService, toExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestContextService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-browser/remoteAgentService.js';
import { IExtensionContributions, ExtensionType, IExtensionDescription, IExtension } from '../../../../../platform/extensions/common/extensions.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ILabelService, IFormatterChangeEvent } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestEnvironmentService, TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSyncEnablementService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Mutable } from '../../../../../base/common/types.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';

let instantiationService: TestInstantiationService;
let installEvent: Emitter<InstallExtensionEvent>,
	didInstallEvent: Emitter<readonly InstallExtensionResult[]>,
	uninstallEvent: Emitter<UninstallExtensionEvent>,
	didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

function setupTest(disposables: Pick<DisposableStore, 'add'>) {
	installEvent = disposables.add(new Emitter<InstallExtensionEvent>());
	didInstallEvent = disposables.add(new Emitter<readonly InstallExtensionResult[]>());
	uninstallEvent = disposables.add(new Emitter<UninstallExtensionEvent>());
	didUninstallEvent = disposables.add(new Emitter<DidUninstallExtensionEvent>());

	instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);

	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(ILogService, NullLogService);

	instantiationService.stub(IWorkspaceContextService, new TestContextService());
	instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IProgressService, ProgressService);
	instantiationService.stub(IProductService, {});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());

	instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
	instantiationService.stub(IExtensionGalleryManifestService, {
		onDidChangeExtensionGalleryManifest: Event.None,
		onDidChangeExtensionGalleryManifestStatus: Event.None,
		extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Unavailable,
		async getExtensionGalleryManifest() { return null; }
	});
	instantiationService.stub(ISharedProcessService, TestSharedProcessService);

	instantiationService.stub(IWorkbenchExtensionManagementService, {
		onDidInstallExtensions: didInstallEvent.event,
		// eslint-disable-next-line local/code-no-any-casts
		onInstallExtension: installEvent.event as any,
		// eslint-disable-next-line local/code-no-any-casts
		onUninstallExtension: uninstallEvent.event as any,
		// eslint-disable-next-line local/code-no-any-casts
		onDidUninstallExtension: didUninstallEvent.event as any,
		onDidUpdateExtensionMetadata: Event.None,
		onDidChangeProfile: Event.None,
		onProfileAwareDidInstallExtensions: Event.None,
		async getInstalled() { return []; },
		async getInstalledWorkspaceExtensions() { return []; },
		async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
		async updateMetadata(local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) {
			local.identifier.uuid = metadata.id;
			local.publisherDisplayName = metadata.publisherDisplayName!;
			local.publisherId = metadata.publisherId!;
			return local;
		},
		async canInstall() { return true; },
		async getTargetPlatform() { return getTargetPlatform(platform, arch); },
	});

	instantiationService.stub(IRemoteAgentService, RemoteAgentService);

	const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService, label: 'local', id: 'vscode-local' };
	instantiationService.stub(IExtensionManagementServerService, {
		get localExtensionManagementServer(): IExtensionManagementServer {
			return localExtensionManagementServer;
		},
		getExtensionManagementServer(extension: IExtension): IExtensionManagementServer | null {
			if (extension.location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			throw new Error(`Invalid Extension ${extension.location}`);
		}
	});

	instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));
	instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
	instantiationService.stub(ILabelService, { onDidChangeFormatters: disposables.add(new Emitter<IFormatterChangeEvent>()).event });

	instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
	instantiationService.stub(IExtensionTipsService, disposables.add(instantiationService.createInstance(TestExtensionTipsService)));
	instantiationService.stub(IExtensionRecommendationsService, {});
	instantiationService.stub(IURLService, NativeURLService);

	instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
	instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
	instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
	instantiationService.stub(IExtensionService, { extensions: [], onDidChangeExtensions: Event.None, canAddExtension: (extension: IExtensionDescription) => false, canRemoveExtension: (extension: IExtensionDescription) => false, whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
	(<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).reset();

	instantiationService.stub(IUserDataSyncEnablementService, disposables.add(instantiationService.createInstance(UserDataSyncEnablementService)));

	instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
	instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
	instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
	instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
}


suite('ExtensionsActions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => setupTest(disposables));

	test('Install action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));

		assert.ok(!testObject.enabled);
	});

	test('Test Install action when state is installed', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal()
			.then(() => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier })));
				return workbenchService.queryGallery(CancellationToken.None)
					.then((paged) => {
						testObject.extension = paged.firstPage[0];
						assert.ok(!testObject.enabled);
						assert.strictEqual('Install', testObject.label);
						assert.strictEqual('extension-action label prominent install hide', testObject.class);
					});
			});
	});

	test('Test InstallingLabelAction when state is installing', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });

				assert.ok(!testObject.enabled);
				assert.strictEqual('Installing', testObject.label);
				assert.strictEqual('extension-action label install installing', testObject.class);
			});
	});

	test('Test Install action when state is uninstalled', async () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		const promise = Event.toPromise(Event.filter(testObject.onDidChange, e => e.enabled === true));
		testObject.extension = paged.firstPage[0];
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Install', testObject.label);
	});

	test('Test Install action when extension is system action', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Install action when extension doesnot has gallery', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Uninstall action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test Uninstall action when state is uninstalling', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstalling', testObject.label);
				assert.strictEqual('extension-action label uninstall uninstalling', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is system extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installing and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const gallery = aGalleryExtension('a');
				const extension = extensions[0];
				extension.gallery = gallery;
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				testObject.extension = extension;
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Uninstall action after extension is installed', async () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Uninstall', testObject.label);
		assert.strictEqual('extension-action label uninstall', testObject.class);
	});

	test('Test UpdateAction when there is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test UpdateAction when extension is installed and not outdated', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: local.manifest.version })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and system extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and user extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		return workbenchService.queryLocal()
			.then(async extensions => {
				testObject.extension = extensions[0];
				const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
				instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
				instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
				assert.ok(!testObject.enabled);
				return new Promise<void>(c => {
					disposables.add(testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					}));
					instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
				});
			});
	});

	test('Test UpdateAction when extension is installing and outdated and user extension', async () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
		await new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (testObject.enabled) {
					c();
				}
			}));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		});
		await new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (!testObject.enabled) {
					c();
				}
			}));
			installEvent.fire({ identifier: local.identifier, source: gallery, profileLocation: null! });
		});
	});

	test('Test ManageExtensionAction when there is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test ManageExtensionAction when extension is installed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is installing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];

				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is queried from gallery and installed', async () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
		assert.strictEqual('Manage', testObject.tooltip);
	});

	test('Test ManageExtensionAction when extension is system extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalling', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test EnableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableForWorkspaceAction when there extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally and workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableGloballyAction when the extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled in both', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableDropDownAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = page.firstPage[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));

		assert.ok(!testObject.enabled);
	});

	test('Test DisableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when the extension is disabled workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));

		assert.ok(!testObject.enabled);
	});

	test('Test DisableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = page.firstPage[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

});

suite('UninstallDropdownAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		setupTest(disposables);
		instantiationService.stub(IAllowedExtensionsService, {
			onDidChangeAllowedExtensionsConfigValue: Event.None,
			isAllowed: () => true,
		});
		instantiationService.stub(IUserDataProfilesService, { profiles: [
			toUserDataProfile('default', 'Default', URI.file('default'), URI.file('cache')),
			toUserDataProfile('other', 'Other', URI.file('other'), URI.file('cache')),
		] });
	});

	async function setupInstallations(local: ILocalExtension[], remote: ILocalExtension[], web?: ILocalExtension[]) {
		const localService = createExtensionManagementService(local);
		const remoteService = createExtensionManagementService(remote);
		const localWillUninstall = disposables.add(new Emitter<UninstallExtensionEvent>());
		const localDidUninstall = disposables.add(new Emitter<DidUninstallExtensionEvent>());
		const remoteDidUninstall = disposables.add(new Emitter<DidUninstallExtensionEvent>());
		const remoteWillInstall = disposables.add(new Emitter<InstallExtensionEvent>());
		const remoteDidInstall = disposables.add(new Emitter<readonly InstallExtensionResult[]>());
		localService.onUninstallExtension = localWillUninstall.event;
		localService.onDidUninstallExtension = localDidUninstall.event;
		remoteService.onDidUninstallExtension = remoteDidUninstall.event;
		remoteService.onInstallExtension = remoteWillInstall.event;
		remoteService.onDidInstallExtensions = remoteDidInstall.event;
		const servers = aMultiExtensionManagementServerService(instantiationService, localService, remoteService, web ? createExtensionManagementService(web) : undefined);
		Object.defineProperty(servers.remoteExtensionManagementServer, 'label', { value: 'WSL: Ubuntu' });
		instantiationService.stub(IExtensionManagementServerService, servers);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);
		await workbenchService.queryLocal();
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallDropdownAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [action]));
		return { action, workbenchService, servers, localWillUninstall, localDidUninstall, remoteDidUninstall, remoteWillInstall, remoteDidInstall };
	}

	suite('adjacent other-location uninstall', () => {
		function createSecondary(server: IExtensionManagementServer, selected: IWorkbenchExtension) {
			const action = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallInOtherServerAction, server, 'selectedUninstalled'));
			const containers = disposables.add(instantiationService.createInstance(ExtensionContainers, [action]));
			containers.extension = selected;
			return action;
		}

		for (const selectedLocation of ['local', 'remote'] as const) {
			test('offers a separate uninstall after removing the selected ' + selectedLocation + ' copy', async () => {
				const { action, workbenchService, servers, localDidUninstall, remoteDidUninstall } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
				const local = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
				const remote = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
				const selected = selectedLocation === 'local' ? local : remote;
				const other = selectedLocation === 'local' ? remote : local;
				const secondary = createSecondary(other.server!, selected);
				const label = selectedLocation === 'local' ? 'Uninstall from WSL: Ubuntu' : 'Uninstall Locally';
				action.extension = selected;
				assert.deepStrictEqual({ secondaryHidden: secondary.hidden, alternate: action.menuActions.some(item => item.label === label) }, { secondaryHidden: true, alternate: true });

				(selectedLocation === 'local' ? localDidUninstall : remoteDidUninstall).fire({ identifier: selected.identifier, profileLocation: null! });
				assert.deepStrictEqual({ mainHidden: action.hidden, mainMenu: action.menuActions, secondaryHidden: secondary.hidden, enabled: secondary.enabled, label: secondary.label }, {
					mainHidden: true, mainMenu: [], secondaryHidden: false, enabled: true, label,
				});
				const removed: IWorkbenchExtension[] = [];
				instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
				await action.run();
				await secondary.run();
				assert.deepStrictEqual({ removed, selected: secondary.extension }, { removed: [other], selected });
			});
		}

		test('counterpart removal hides the secondary button and invalidates a stale invocation', async () => {
			const { workbenchService, servers, localWillUninstall, localDidUninstall, remoteDidUninstall } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
			const selected = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
			remoteDidUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			const secondary = createSecondary(servers.localExtensionManagementServer!, selected);
			assert.ok(secondary.enabled);
			const removed: IWorkbenchExtension[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
			localWillUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			await secondary.run();
			assert.deepStrictEqual({ hidden: secondary.hidden, enabled: secondary.enabled, removed }, { hidden: true, enabled: false, removed: [] });
			localDidUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			await secondary.run();
			assert.deepStrictEqual({ hidden: secondary.hidden, removed }, { hidden: true, removed: [] });
		});

		test('changing selection never turns the secondary button into the selected installation action', async () => {
			const { workbenchService, servers, remoteDidUninstall } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
			const local = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
			const remote = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
			remoteDidUninstall.fire({ identifier: remote.identifier, profileLocation: null! });
			const secondary = createSecondary(servers.localExtensionManagementServer!, remote);
			assert.ok(secondary.enabled);
			const removed: IWorkbenchExtension[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
			secondary.extension = local;
			await secondary.run();
			assert.deepStrictEqual({ hidden: secondary.hidden, enabled: secondary.enabled, removed }, { hidden: true, enabled: false, removed: [] });
		});

		test('hides the secondary button during reinstall and restores it after failure', async () => {
			const { workbenchService, servers, remoteDidUninstall, remoteWillInstall, remoteDidInstall } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
			const selected = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
			remoteDidUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			const secondary = createSecondary(servers.localExtensionManagementServer!, selected);
			assert.ok(secondary.enabled);
			const gallery = aGalleryExtension('a');
			remoteWillInstall.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
			const removed: IWorkbenchExtension[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
			await secondary.run();
			assert.deepStrictEqual({ hidden: secondary.hidden, enabled: secondary.enabled, removed }, { hidden: true, enabled: false, removed: [] });
			remoteDidInstall.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, error: new Error('Install failed'), profileLocation: null! }]);
			assert.deepStrictEqual({ hidden: secondary.hidden, enabled: secondary.enabled, label: secondary.label }, { hidden: false, enabled: true, label: 'Uninstall Locally' });
		});

		test('names browser and All Profiles targets independently of the selected installation', async () => {
			const { workbenchService, servers, remoteDidUninstall } = await setupInstallations([aLocalExtension('a', {}, { isApplicationScoped: true })], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeUserData, path: '/pub.a' }) })]);
			const selected = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
			remoteDidUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			const actions = [createSecondary(servers.localExtensionManagementServer!, selected), createSecondary(servers.webExtensionManagementServer!, selected)];
			const removed: IWorkbenchExtension[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
			for (const action of actions) {
				await action.run();
			}
			assert.deepStrictEqual({ labels: actions.map(action => action.label), servers: removed.map(extension => extension.server) }, {
				labels: ['Uninstall Locally (All Profiles)', 'Uninstall from Browser'],
				servers: [servers.localExtensionManagementServer, servers.webExtensionManagementServer],
			});
		});

		for (const excluded of ['built-in', 'workspace', 'language pack'] as const) {
			test('does not offer an individual-location uninstall for a ' + excluded + ' target', async () => {
				const manifest = excluded === 'language pack' ? { contributes: { localizations: [{ languageId: 'de', translations: [] }] } } : {};
				const local = aLocalExtension('a', manifest, { type: excluded === 'built-in' ? ExtensionType.System : ExtensionType.User, isWorkspaceScoped: excluded === 'workspace' });
				const { workbenchService, servers, remoteDidUninstall } = await setupInstallations([local], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
				const selected = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
				remoteDidUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
				const action = createSecondary(servers.localExtensionManagementServer!, selected);
				assert.deepStrictEqual({ hidden: action.hidden, enabled: action.enabled }, { hidden: true, enabled: false });
			});
		}
	});

	for (const selectedLocation of ['local', 'remote'] as const) {
		test(`uninstalls the selected ${selectedLocation} installation and offers the other installation explicitly`, async () => {
			const local = aLocalExtension('a');
			const remote = aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) });
			const { action, workbenchService, servers } = await setupInstallations([local], [remote]);
			const localModel = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
			const remoteModel = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
			const selected = selectedLocation === 'local' ? localModel : remoteModel;
			const other = selectedLocation === 'local' ? remoteModel : localModel;
			const selectedLabel = selectedLocation === 'local' ? 'Uninstall Locally' : 'Uninstall from WSL: Ubuntu';
			const otherLabel = selectedLocation === 'local' ? 'Uninstall from WSL: Ubuntu' : 'Uninstall Locally';
			const removed: IWorkbenchExtension[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
			action.extension = selected;

			assert.deepStrictEqual({ label: action.label, tooltip: action.tooltip, menu: action.menuActions.map(item => item.label) }, {
				label: selectedLabel, tooltip: selectedLabel, menu: [selectedLabel, otherLabel]
			});
			await action.run();
			await action.menuActions[1].run();
			assert.deepStrictEqual(removed, [selected, other]);
		});
	}

	test('switching installations updates both the primary and dropdown targets', async () => {
		const { action, workbenchService, servers } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
		const local = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
		const remote = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
		const removed: IWorkbenchExtension[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
		action.extension = remote;
		action.extension = local;
		await action.run();
		await action.menuActions[1].run();
		assert.deepStrictEqual(removed, [local, remote]);
	});

	test('only offers installed copies and preserves Install Specific Version', async () => {
		const local = aLocalExtension('a', {}, { identifier: { id: 'pub.a', uuid: generateUuid() } });
		const { action, workbenchService } = await setupInstallations([local], []);
		action.extension = workbenchService.installed[0];
		assert.deepStrictEqual(action.menuActions.map(item => item.label), ['Uninstall Locally', 'Install Specific Version...']);
	});

	test('preserves migration as the primary action for a deprecated extension', async () => {
		const { action, workbenchService, servers } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
		const extension: Mutable<IWorkbenchExtension> = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
		extension.deprecationInfo = { extension: { id: 'pub.replacement', displayName: 'Replacement' } };
		action.extension = extension;
		assert.deepStrictEqual({ label: action.label, menu: action.menuActions.map(item => item.label) }, {
			label: 'Migrate to Replacement', menu: ['Migrate to Replacement', 'Uninstall Locally', 'Uninstall from WSL: Ubuntu']
		});
	});

	test('updates the dropdown when the other installation is removed', async () => {
		const remote = aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) });
		const { action, workbenchService, servers, remoteDidUninstall } = await setupInstallations([aLocalExtension('a')], [remote]);
		action.extension = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
		const oldRemoteAction = action.menuActions[1];
		const removed: IWorkbenchExtension[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
		remoteDidUninstall.fire({ identifier: remote.identifier, profileLocation: null! });
		await oldRemoteAction.run();
		assert.deepStrictEqual({ label: action.label, menu: action.menuActions, removed }, { label: 'Uninstall Locally', menu: [], removed: [] });
	});

	test('does not promote another location after the selected installation is removed', async () => {
		const remote = aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) });
		const { action, workbenchService, servers, remoteDidUninstall } = await setupInstallations([aLocalExtension('a')], [remote]);
		action.extension = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
		remoteDidUninstall.fire({ identifier: remote.identifier, profileLocation: null! });
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, menu: action.menuActions }, { enabled: false, hidden: true, menu: [] });
	});

	test('does not promote another location when the selected installation is built in', async () => {
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		const remote = aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) });
		const { action, workbenchService, servers } = await setupInstallations([local], [remote]);
		const removed: IWorkbenchExtension[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
		action.extension = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, menu: action.menuActions, removed }, { enabled: false, hidden: true, menu: [], removed: [] });
	});

	test('does not retarget another location when a removed Marketplace copy retains stale installed state', async () => {
		const identifier = { id: 'pub.a', uuid: generateUuid() };
		const remote = aLocalExtension('a', {}, { identifier, location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) });
		const { action, workbenchService, servers, remoteDidUninstall } = await setupInstallations([aLocalExtension('a', {}, { identifier })], [remote]);
		action.extension = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
		const localAction = action.menuActions.find(item => item.label === 'Uninstall Locally')!;
		const removed: IWorkbenchExtension[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async (extension: IWorkbenchExtension) => { removed.push(extension); });
		remoteDidUninstall.fire({ identifier, profileLocation: null! });
		await localAction.run();
		assert.deepStrictEqual({ localUninstallOffered: action.menuActions.some(item => item.label === 'Uninstall Locally'), removed }, { localUninstallOffered: false, removed: [] });
	});

	test('identifies browser installations', async () => {
		const { action, workbenchService, servers } = await setupInstallations([], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeUserData, path: '/pub.a' }) })]);
		action.extension = workbenchService.installed.find(extension => extension.server === servers.webExtensionManagementServer)!;
		assert.deepStrictEqual({ label: action.label, menu: action.menuActions.map(item => item.label) }, {
			label: 'Uninstall from Browser', menu: ['Uninstall from Browser', 'Uninstall from WSL: Ubuntu']
		});
	});

	test('keeps All Profiles tied to each installation', async () => {
		const { action, workbenchService, servers } = await setupInstallations([aLocalExtension('a', {}, { isApplicationScoped: true })], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
		action.extension = workbenchService.installed.find(extension => extension.server === servers.remoteExtensionManagementServer)!;
		assert.deepStrictEqual(action.menuActions.map(item => item.label), ['Uninstall from WSL: Ubuntu', 'Uninstall Locally (All Profiles)']);
	});

	test('language packs describe their existing all-locations scope without offering individual locations', async () => {
		const manifest = { contributes: { localizations: [{ languageId: 'de', translations: [] }] } };
		const { action, workbenchService } = await setupInstallations([aLocalExtension('a', manifest, { isApplicationScoped: true })], [aLocalExtension('a', manifest, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }), isApplicationScoped: true })]);
		action.extension = workbenchService.installed[0];
		assert.deepStrictEqual({ label: action.label, menu: action.menuActions }, { label: 'Uninstall from All Locations (All Profiles)', menu: [] });
	});

	test('workspace extensions keep their workspace scope', async () => {
		const local = aLocalExtension('a', {}, { isWorkspaceScoped: true });
		const { workbenchService } = await setupInstallations([], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
		instantiationService.stubPromise(IWorkbenchExtensionManagementService, 'getInstalledWorkspaceExtensions', [local]);
		await workbenchService.queryLocal();
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallDropdownAction));
		action.extension = workbenchService.installed.find(extension => extension.isWorkspaceScoped)!;
		assert.deepStrictEqual({ label: action.label, menu: action.menuActions }, { label: 'Uninstall from Workspace', menu: [] });
	});

	for (const error of [new Error('Uninstall failed'), new CancellationError()]) {
		test(`other-location uninstall preserves error handling for ${error.name}`, async () => {
			const { workbenchService, servers } = await setupInstallations([aLocalExtension('a')], [aLocalExtension('a', {}, { location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.a' }) })]);
			const errors: string[] = [];
			instantiationService.stub(IDialogService, { error: async message => { errors.push(message); } });
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'uninstall', async () => { throw error; });
			// Create the action after installing the dialog stub so its children use that service.
			const testAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallDropdownAction));
			testAction.extension = workbenchService.installed.find(extension => extension.server === servers.localExtensionManagementServer)!;
			await testAction.menuActions[1].run();
			assert.deepStrictEqual(errors, error instanceof CancellationError ? [] : ['Uninstall failed']);
		});
	}
});

suite('ExtensionStatusLabelAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let localServer: IExtensionManagementServer;
	let remoteServer: IExtensionManagementServer;

	setup(() => {
		setupTest(disposables);
		const servers = aMultiExtensionManagementServerService(instantiationService);
		localServer = servers.localExtensionManagementServer!;
		remoteServer = servers.remoteExtensionManagementServer!;
		instantiationService.stub(IExtensionManagementServerService, servers);
		instantiationService.stub(IExtensionService, {
			extensions: [], onDidChangeExtensions: Event.None,
			canAddExtension: () => true, canRemoveExtension: () => true,
		});
	});

	function createExtension(server: IExtensionManagementServer | undefined, state: () => ExtensionState, version = '1.0.0', enablementState = EnablementState.EnabledGlobally): Extension {
		const local = aLocalExtension('a', { version, extensionKind: ['workspace'], main: 'main.js' }, {
			location: URI.from({ scheme: server === remoteServer ? Schemas.vscodeRemote : Schemas.file, path: '/pub.a' }),
		});
		const extension = instantiationService.createInstance(Extension, state, () => undefined, server, local, undefined, undefined);
		extension.enablementState = enablementState;
		return extension;
	}

	test('switching between differently enabled local and remote installations does not report enablement changes', () => {
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
		const local = createExtension(localServer, () => ExtensionState.Installed, '1.0.0', EnablementState.DisabledByExtensionKind);
		const remote = createExtension(remoteServer, () => ExtensionState.Installed);
		const labels = [local, remote, local].map(extension => {
			action.extension = extension;
			return { label: action.label, hidden: action.class?.includes(' hide') };
		});
		assert.deepStrictEqual(labels, [{ label: '', hidden: true }, { label: '', hidden: true }, { label: '', hidden: true }]);
	});

	for (const initialState of [ExtensionState.Uninstalled, ExtensionState.Installed]) {
		test(`switching away from an ${initialState === ExtensionState.Uninstalled ? 'installing' : 'updating'} installation does not report completion on the other server`, () => {
			let state = initialState;
			const action = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
			action.extension = createExtension(localServer, () => state);
			state = ExtensionState.Installing;
			action.update();
			action.extension = createExtension(remoteServer, () => ExtensionState.Installed, '2.0.0');
			assert.deepStrictEqual({ label: action.label, hidden: action.class?.includes(' hide') }, { label: '', hidden: true });
		});

		test(`a replacement model on the same server preserves ${initialState === ExtensionState.Uninstalled ? 'installation' : 'update'} completion`, () => {
			let state = initialState;
			const action = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
			action.extension = createExtension(localServer, () => state);
			state = ExtensionState.Installing;
			action.update();
			action.extension = createExtension(localServer, () => ExtensionState.Installed, '2.0.0');
			assert.deepStrictEqual({ label: action.label, hidden: action.class?.includes(' hide') }, {
				label: initialState === ExtensionState.Uninstalled ? 'Installed' : 'Updated', hidden: false,
			});
		});
	}

	test('binding a serverless Marketplace result to its installation preserves completion', () => {
		let state = ExtensionState.Uninstalled;
		const gallery = aGalleryExtension('a');
		const model = instantiationService.createInstance(Extension, () => state, () => undefined, undefined, undefined, gallery, undefined);
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
		action.extension = model;
		state = ExtensionState.Installing;
		action.update();
		const installed = createExtension(localServer, () => ExtensionState.Installed);
		installed.gallery = gallery;
		action.extension = installed;
		assert.deepStrictEqual({ label: action.label, hidden: action.class?.includes(' hide') }, { label: 'Installed', hidden: false });
	});
});

suite('ExtensionRuntimeStateAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setupTest(disposables));

	test('Test Runtime State when there is no extension', () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension state is installing', async () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension state is uninstalling', async () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is newly installed', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please restart extensions to enable this extension.`);
	});

	test('Test Runtime State when extension is newly installed and ext host restart is not required', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is installed and uninstalled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);

		testObject.extension = paged.firstPage[0];
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, { identifier }), profileLocation: null! }]);
		uninstallEvent.fire({ identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier, profileLocation: null! });

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is uninstalled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please restart extensions to complete the uninstallation of this extension.`);
	});

	test('Test Runtime State when extension is uninstalled and can be removed', async () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is uninstalled and installed', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();

		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

		const gallery = aGalleryExtension('a');
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local, profileLocation: null! }]);

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		return new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === `Please restart extensions to enable the updated extension.`) {
					c();
				}
			}));
			const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
			installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
			didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		});
	});

	test('Test Runtime State when extension is updated when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Update, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is disabled when running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await testObject.update();

		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to disable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when extension enablement is toggled when running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is enabled when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when extension enablement is toggled when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is updated when not running and enabled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when a localization extension is newly installed', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when a localization extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.1', contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is not installed but extension from different server is installed and running', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is uninstalled but extension from different server is installed and running', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const uninstallEvent = new Emitter<UninstallExtensionEvent>();
		const onDidUninstallEvent = new Emitter<{ identifier: IExtensionIdentifier; profileLocation: URI }>();
		localExtensionManagementService.onUninstallExtension = uninstallEvent.event;
		localExtensionManagementService.onDidUninstallExtension = onDidUninstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		uninstallEvent.fire({ identifier: localExtension.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: localExtension.identifier, profileLocation: null! });

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when workspace extension is disabled on local server and installed in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const remoteExtensionManagementService = createExtensionManagementService([]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: remoteExtension.identifier, local: remoteExtension, operation: InstallOperation.Install, profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please reload window to enable this extension.`);
	});

	test('Test Runtime State when ui extension is disabled on remote server and installed in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtensionManagementService = createExtensionManagementService([]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
		const promise = Event.toPromise(Event.filter(testObject.onDidChange, () => testObject.enabled));
		onDidInstallEvent.fire([{ identifier: localExtension.identifier, local: localExtension, operation: InstallOperation.Install, profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please reload window to enable this extension.`);
	});

	test('Test Runtime State for remote ui extension is disabled when it is installed and enabled in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State for remote workspace+ui extension is enabled when it is installed and enabled in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test Runtime State for local ui+workspace extension is enabled when it is installed and enabled in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test Runtime State for local workspace+ui extension is enabled when it is installed in both servers but running in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test Runtime State for remote ui+workspace extension is enabled when it is installed on both servers but running in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test Runtime State when ui+workspace+web extension is installed in web and remote and running in remote', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const webExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, null, createExtensionManagementService([remoteExtension]), createExtensionManagementService([webExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: Event.None,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when workspace+ui+web extension is installed in web and local and running in local', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const webExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a') });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), null, createExtensionManagementService([webExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: Event.None,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});
});

suite('ReinstallInSelectedServer', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		setupTest(disposables);
		instantiationService.stub(IProgressService, { withProgress: (_options, task) => task({ report() { } }) });
	});

	async function setupRemovedInstallation(target: 'local' | 'remote' | 'web', gallery?: IGalleryExtension, sourceProperties: Partial<ILocalExtension> = {}, sourceLocation?: 'web', removeTarget = true) {
		const identifier = gallery?.identifier ?? { id: 'pub.a', uuid: generateUuid() };
		const manifest = { extensionKind: ['workspace'], main: 'main.js', browser: 'browser.js' };
		const targetScheme = target === 'local' ? Schemas.file : target === 'remote' ? Schemas.vscodeRemote : Schemas.vscodeUserData;
		const sourceScheme = sourceLocation === 'web' ? Schemas.vscodeUserData : target === 'remote' ? Schemas.file : Schemas.vscodeRemote;
		const removed = aLocalExtension('a', manifest, { identifier, location: URI.from({ scheme: targetScheme, path: '/pub.a' }) });
		const source = aLocalExtension('a', manifest, { identifier, location: URI.from({ scheme: sourceScheme, path: '/pub.a' }), ...sourceProperties });
		const didRemoveTarget = disposables.add(new Emitter<DidUninstallExtensionEvent>());
		const targetWillUninstall = disposables.add(new Emitter<UninstallExtensionEvent>());
		const didRemoveSource = disposables.add(new Emitter<DidUninstallExtensionEvent>());
		const targetInstall = disposables.add(new Emitter<InstallExtensionEvent>());
		const targetDidInstall = disposables.add(new Emitter<readonly InstallExtensionResult[]>());
		const targetService = createExtensionManagementService([removed]);
		targetService.onDidUninstallExtension = didRemoveTarget.event;
		targetService.onUninstallExtension = targetWillUninstall.event;
		targetService.onInstallExtension = targetInstall.event;
		targetService.onDidInstallExtensions = targetDidInstall.event;
		const sourceService = createExtensionManagementService([source]);
		sourceService.onDidUninstallExtension = didRemoveSource.event;
		const servers = aMultiExtensionManagementServerService(instantiationService,
			target === 'local' ? targetService : target === 'remote' && sourceLocation !== 'web' ? sourceService : null,
			target === 'remote' ? targetService : sourceLocation === 'web' ? null : sourceService,
			target === 'web' ? targetService : sourceLocation === 'web' ? sourceService : undefined);
		instantiationService.stub(IExtensionManagementServerService, servers);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);
		const targetServer = target === 'local' ? servers.localExtensionManagementServer! : target === 'remote' ? servers.remoteExtensionManagementServer! : servers.webExtensionManagementServer!;
		await workbenchService.queryLocal();
		if (gallery) {
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
			await workbenchService.queryGallery(CancellationToken.None);
		}
		const selected: Mutable<IWorkbenchExtension> = workbenchService.installed.find(extension => extension.server === targetServer)!;
		const installedSource: Mutable<IWorkbenchExtension> = workbenchService.installed.find(extension => extension.server !== targetServer)!;
		if (gallery) {
			selected.gallery = gallery;
			installedSource.gallery = gallery;
		}
		const action = disposables.add(target === 'local'
			? instantiationService.createInstance(ExtensionsActions.LocalInstallAction)
			: target === 'remote' ? instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false)
				: instantiationService.createInstance(ExtensionsActions.WebInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [action]));
		action.extension = selected;
		if (removeTarget) {
			didRemoveTarget.fire({ identifier, profileLocation: null! });
		}
		return { selected, installedSource, action, workbenchService, targetServer, didRemoveSource, didRemoveTarget, sourceService, targetService, targetInstall, targetDidInstall, targetWillUninstall };
	}

	for (const target of ['local', 'remote'] as const) {
		for (const preRelease of [false, true]) {
			test(`restores a ${preRelease ? 'pre-release' : 'release'} VSIX to its selected ${target} server from the surviving workspace extension`, async () => {
				const { action, selected, installedSource, workbenchService, targetServer } = await setupRemovedInstallation(target, undefined, { preRelease });
				const installed: { source: IWorkbenchExtension; server: IExtensionManagementServer }[] = [];
				const opened: IWorkbenchExtension[] = [];
				instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async (source: IWorkbenchExtension, server: IExtensionManagementServer) => { installed.push({ source, server }); });
				instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', async (extension: IWorkbenchExtension) => { opened.push(extension); });
				assert.deepStrictEqual({ enabled: action.enabled, label: action.label }, { enabled: true, label: target === 'local' ? 'Install Locally' : 'Install in remote' });
				await action.run();
				assert.deepStrictEqual({ installed, opened, preRelease: installed[0].source.local?.preRelease }, {
					installed: [{ source: installedSource, server: targetServer }], opened: [selected], preRelease
				});
			});
		}
	}

	for (const target of ['local', 'remote'] as const) {
		test(`shares destination-only progress across source and selected ${target} actions through completion`, async () => {
			const { action, selected, installedSource, workbenchService, targetService, targetInstall, targetDidInstall, targetWillUninstall, didRemoveTarget } = await setupRemovedInstallation(target, undefined, {}, undefined, false);
			const sourceInstall = disposables.add(target === 'local' ? instantiationService.createInstance(ExtensionsActions.LocalInstallAction) : instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
			const sourceOtherInstall = disposables.add(target === 'local' ? instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false) : instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
			const targetOtherInstall = disposables.add(target === 'local' ? instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false) : instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
			const sourceProgress = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
			const sourceUninstall = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
			const sourceManage = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
			const sourceStatus = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
			const targetProgress = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
			const targetUninstall = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
			const targetManage = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
			const targetStatus = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionStatusLabelAction));
			const sourceContainers = disposables.add(instantiationService.createInstance(ExtensionContainers, [sourceInstall, sourceOtherInstall, sourceProgress, sourceUninstall, sourceManage, sourceStatus]));
			const targetContainers = disposables.add(instantiationService.createInstance(ExtensionContainers, [targetProgress, targetOtherInstall, targetUninstall, targetManage, targetStatus]));
			sourceContainers.extension = installedSource;
			targetContainers.extension = selected;
			targetWillUninstall.fire({ identifier: selected.identifier, profileLocation: null! });
			assert.deepStrictEqual({ sourceUninstall: sourceUninstall.enabled, sourceManage: sourceManage.enabled, targetUninstall: targetUninstall.enabled, targetManage: targetManage.enabled, targetState: selected.state }, {
				sourceUninstall: true, sourceManage: true, targetUninstall: false, targetManage: false, targetState: ExtensionState.Uninstalling,
			});
			didRemoveTarget.fire({ identifier: selected.identifier, profileLocation: null! });
			assert.deepStrictEqual({ sourceStatus: sourceStatus.label, targetStatus: targetStatus.label, restore: action.enabled }, { sourceStatus: '', targetStatus: 'Uninstalled', restore: true });
			const lookupStarted = new DeferredPromise<void>();
			const lookupCompleted = new DeferredPromise<void>();
			const backendStarted = new DeferredPromise<void>();
			const backendCompleted = new DeferredPromise<void>();
			const gallery: Mutable<IGalleryExtension> = aGalleryExtension('a');
			gallery.identifier = { id: selected.identifier.id, uuid: selected.identifier.uuid! };
			const galleryModel = instantiationService.createInstance(Extension, () => ExtensionState.Uninstalled, () => undefined, undefined, undefined, gallery, undefined);
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'getExtensions', async () => {
				await lookupStarted.complete();
				await lookupCompleted.p;
				return [galleryModel];
			});
			instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
			let installs = 0;
			targetService.installFromGallery = async () => {
				installs++;
				targetInstall.fire({ identifier: selected.identifier, source: gallery, profileLocation: null! });
				targetDidInstall.fire([{ identifier: selected.identifier, source: gallery, local: selected.local!, operation: InstallOperation.Install, profileLocation: null! }]);
				await backendStarted.complete();
				await backendCompleted.p;
				return selected.local!;
			};
			const progress = () => ({
				sourceState: installedSource.state,
				sourceProgress: { hidden: sourceProgress.hidden, cssHidden: sourceProgress.class?.includes(' hide') ?? false },
				sourceUninstall: sourceUninstall.enabled,
				sourceManage: sourceManage.enabled,
				statusLabels: [sourceStatus.label, targetStatus.label],
				sourceInstall: { enabled: sourceInstall.enabled, hidden: sourceInstall.hidden, label: sourceInstall.label },
				otherInstallHidden: [sourceOtherInstall.hidden, targetOtherInstall.hidden],
				targetUninstall: targetUninstall.enabled,
				targetManage: { enabled: targetManage.enabled, cssHidden: targetManage.class?.includes(' hide') ?? false },
				targetRestore: { enabled: action.enabled, hidden: action.hidden, cssInstalling: action.class?.includes(' installing') ?? false },
				targetProgress: [action, targetOtherInstall, targetProgress].filter(item => !item.hidden && !item.class?.includes(' hide')).map(item => ({ label: item.label, enabled: item.enabled })),
			});
			const expected = {
				sourceState: ExtensionState.Installed, sourceProgress: { hidden: true, cssHidden: true }, sourceUninstall: true, sourceManage: true, statusLabels: ['', ''],
				sourceInstall: { enabled: false, hidden: false, label: target === 'local' ? 'Installing Locally' : 'Installing in remote' },
				otherInstallHidden: [true, true], targetUninstall: false, targetManage: { enabled: false, cssHidden: true },
				targetRestore: { enabled: false, hidden: true, cssInstalling: false }, targetProgress: [{ label: 'Installing', enabled: false }],
			};
			const run = action.run();
			try {
				await lookupStarted.p;
				assert.deepStrictEqual(progress(), expected);
				await sourceInstall.run();
				await action.run();
				await lookupCompleted.complete();
				await backendStarted.p;
				assert.deepStrictEqual(progress(), expected);
				await backendCompleted.complete();
				await run;
				assert.deepStrictEqual({
					installs, sourceState: installedSource.state, sourceProgressHidden: sourceProgress.hidden,
					targetProgressHidden: targetProgress.hidden, restoreHidden: action.hidden, sourceInstallHidden: sourceInstall.hidden,
					sourceUninstall: sourceUninstall.enabled, targetUninstall: targetUninstall.enabled,
				}, {
					installs: 1, sourceState: ExtensionState.Installed, sourceProgressHidden: true,
					targetProgressHidden: true, restoreHidden: true, sourceInstallHidden: true,
					sourceUninstall: true, targetUninstall: true,
				});
			} finally {
				await lookupCompleted.complete();
				await backendCompleted.complete();
				await run;
			}
		});
	}

	test('restores retry controls on a fresh destination model after shared installation failure', async () => {
		const { action, installedSource, workbenchService, targetServer } = await setupRemovedInstallation('remote');
		const progress = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
		const containers = disposables.add(instantiationService.createInstance(ExtensionContainers, [progress]));
		const lookupStarted = new DeferredPromise<void>();
		const lookupCompleted = new DeferredPromise<void>();
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'getExtensions', async () => {
			await lookupStarted.complete();
			await lookupCompleted.p;
			throw new Error('Lookup failed');
		});
		instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		const run = action.run();
		const failed = assert.rejects(run, /Lookup failed/);
		try {
			await lookupStarted.p;
			const pending = workbenchService.installed.find(extension => extension.server === targetServer)!;
			assert.strictEqual(pending.local, undefined);
			action.extension = pending;
			containers.extension = pending;
			assert.deepStrictEqual({ restoreHidden: action.hidden, progressHidden: progress.hidden }, { restoreHidden: true, progressHidden: false });
			await lookupCompleted.complete();
			await failed;
			assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, label: action.label, progressHidden: progress.hidden, sourceState: installedSource.state }, {
				enabled: true, hidden: false, label: 'Install in remote', progressHidden: true, sourceState: ExtensionState.Installed,
			});
		} finally {
			await lookupCompleted.complete();
			await failed;
		}
	});

	test('disables restoring the selected server while installation is in progress', async () => {
		const { action, workbenchService } = await setupRemovedInstallation('remote');
		const completion = new DeferredPromise<void>();
		let calls = 0;
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; await completion.p; });
		instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		const run = action.run();
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 1 });
		await completion.complete();
		await run;
		assert.strictEqual(action.enabled, true);
	});

	test('tracks installation progress separately after retargeting the page to another extension', async () => {
		const { action, workbenchService, installedSource, targetServer, sourceService, targetService, didRemoveTarget } = await setupRemovedInstallation('remote');
		const completionA = new DeferredPromise<void>();
		const completionB = new DeferredPromise<void>();
		const calls: string[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async (source: IWorkbenchExtension) => {
			calls.push(source.identifier.id);
			await (source.identifier.id === 'pub.a' ? completionA.p : completionB.p);
		});
		instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		const runA = action.run();
		const identifier = { id: 'pub.b', uuid: generateUuid() };
		const sourceB = aLocalExtension('b', { extensionKind: ['workspace'], main: 'main.js' }, { identifier });
		const selectedB = aLocalExtension('b', { extensionKind: ['workspace'], main: 'main.js' }, { identifier, location: URI.from({ scheme: Schemas.vscodeRemote, path: '/pub.b' }) });
		sourceService.getInstalled = async () => [installedSource.local!, sourceB];
		targetService.getInstalled = async () => [selectedB];
		await workbenchService.queryLocal();
		const extensionB = workbenchService.installed.find(extension => extension.server === targetServer && extension.identifier.id === identifier.id)!;
		didRemoveTarget.fire({ identifier, profileLocation: null! });
		action.extension = extensionB;
		assert.deepStrictEqual({ enabled: action.enabled, label: action.label }, { enabled: true, label: 'Install in remote' });
		const runB = action.run();
		await completionA.complete();
		await runA;
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: ['pub.a', 'pub.b'] });
		await completionB.complete();
		await runB;
		assert.strictEqual(action.enabled, true);
	});

	test('does not copy a stale source after the surviving installation is removed', async () => {
		const { action, workbenchService, installedSource, didRemoveSource } = await setupRemovedInstallation('remote');
		let calls = 0;
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; });
		didRemoveSource.fire({ identifier: installedSource.identifier, profileLocation: null! });
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 0 });
	});

	test('does not use a built-in surviving installation as a VSIX source', async () => {
		const { action } = await setupRemovedInstallation('remote', undefined, { type: ExtensionType.System });
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden }, { enabled: false, hidden: true });
	});

	for (const target of ['local', 'remote'] as const) {
		test(`does not zip a galleryless browser source when restoring the ${target} server`, async () => {
			const { action, workbenchService } = await setupRemovedInstallation(target, undefined, {}, 'web');
			let calls = 0;
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; });
			await action.run();
			assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 0 });
		});
	}

	test('allows a browser source with Marketplace metadata without requiring a VSIX', async () => {
		const { action, installedSource } = await setupRemovedInstallation('remote', undefined, {}, 'web');
		const source: Mutable<IWorkbenchExtension> = installedSource;
		const gallery: Mutable<IGalleryExtension> = aGalleryExtension('a');
		assert.ok(source.identifier.uuid);
		gallery.identifier = { id: source.identifier.id, uuid: source.identifier.uuid };
		source.gallery = gallery;
		action.update();
		assert.deepStrictEqual({ enabled: action.enabled, label: action.label }, { enabled: true, label: 'Install in remote' });
	});

	for (const model of ['selected', 'source'] as const) {
		for (const restriction of ['malicious', 'disallowed'] as const) {
			test(`does not restore from a ${restriction} ${model} installation`, async () => {
				const { action, selected, installedSource, workbenchService } = await setupRemovedInstallation('remote');
				const extension: Mutable<IWorkbenchExtension> = model === 'selected' ? selected : installedSource;
				if (restriction === 'malicious') {
					extension.enablementState = EnablementState.DisabledByMalicious;
				} else {
					extension.deprecationInfo = { disallowInstall: true };
				}
				let calls = 0;
				instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; });
				action.update();
				await action.run();
				assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 0 });
			});
		}
	}

	for (const enablementState of [EnablementState.DisabledByEnvironment, EnablementState.DisabledByTrustRequirement, EnablementState.DisabledByVirtualWorkspace]) {
		test(`does not copy a source blocked with enablement state ${enablementState}`, async () => {
			const { action, installedSource, workbenchService } = await setupRemovedInstallation('remote');
			const source: Mutable<IWorkbenchExtension> = installedSource;
			source.enablementState = enablementState;
			let calls = 0;
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; });
			action.update();
			await action.run();
			assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 0 });
		});
	}

	test('does not copy a VSIX into the browser extension server', async () => {
		const { action, workbenchService } = await setupRemovedInstallation('web');
		let calls = 0;
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'installInServer', async () => { calls++; });
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, hidden: action.hidden, calls }, { enabled: false, hidden: true, calls: 0 });
	});

	for (const target of ['local', 'remote', 'web'] as const) {
		test(`offers release and pre-release Marketplace installation in the selected ${target} server`, async () => {
			const gallery = aGalleryExtension('a', { hasPreReleaseVersion: true });
			const { action: copyAction, selected, workbenchService } = await setupRemovedInstallation(target, gallery);
			const release = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
			const preRelease = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: true }));
			release.extension = selected;
			preRelease.extension = selected;
			await timeout(0);
			const location = target === 'local' ? 'Locally' : target === 'remote' ? 'in remote' : 'in Browser';
			assert.deepStrictEqual({ release: [release.enabled, release.getLabel(true), release.getLabel()], preRelease: [preRelease.enabled, preRelease.getLabel(true), preRelease.getLabel()], copy: copyAction.enabled }, {
				release: [true, `Install ${location}`, `Install Release Version ${location}`],
				preRelease: [true, `Install Pre-Release ${location}`, `Install Pre-Release Version ${location}`], copy: false
			});
			const installed: { extension: IWorkbenchExtension; preRelease: boolean | undefined }[] = [];
			instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'install', async (extension: IWorkbenchExtension, options: { installPreReleaseVersion?: boolean }) => {
				installed.push({ extension, preRelease: options.installPreReleaseVersion });
				return undefined;
			});
			instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
			await release.run();
			await preRelease.run();
			assert.deepStrictEqual(installed, [{ extension: selected, preRelease: false }, { extension: selected, preRelease: true }]);
		});
	}

	test('does not enable a Marketplace install when the selected server rejects the extension', async () => {
		const { selected, targetServer } = await setupRemovedInstallation('remote', aGalleryExtension('a'));
		targetServer.extensionManagementService.canInstall = async () => new MarkdownString('Not supported on this server');
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		action.extension = selected;
		await timeout(0);
		assert.strictEqual(action.enabled, false);
	});

	test('ignores a pending Marketplace capability check after the selected installation changes', async () => {
		const { selected, installedSource, targetServer } = await setupRemovedInstallation('remote', aGalleryExtension('a'));
		const checked = new DeferredPromise<void>();
		const capability = new DeferredPromise<true>();
		targetServer.extensionManagementService.canInstall = async () => { await checked.complete(); return capability.p; };
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		let enabledForOldTarget = false;
		disposables.add(action.onDidChange(event => {
			if (event.enabled && action.extension === installedSource) {
				enabledForOldTarget = true;
			}
		}));
		action.extension = selected;
		await checked.p;
		action.extension = installedSource;
		await capability.complete(true);
		await timeout(0);
		assert.deepStrictEqual({ enabled: action.enabled, enabledForOldTarget }, { enabled: false, enabledForOldTarget: false });
	});

	test('preserves release and pre-release labels for a serverless Marketplace result', async () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { hasPreReleaseVersion: true })));
		instantiationService.stubPromise(IExtensionsWorkbenchService, workbenchService, 'canInstall', true);
		const gallery = (await workbenchService.queryGallery(CancellationToken.None)).firstPage[0];
		const release = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		const preRelease = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: true }));
		release.extension = gallery;
		preRelease.extension = gallery;
		await timeout(0);
		assert.deepStrictEqual({ release: [release.enabled, release.getLabel(true), release.getLabel()], preRelease: [preRelease.enabled, preRelease.getLabel(true), preRelease.getLabel()] }, {
			release: [true, 'Install', 'Install Release Version'], preRelease: [true, 'Install Pre-Release', 'Install Pre-Release Version']
		});
	});

	test('keeps Marketplace deprecation confirmation when reinstalling a selected installation', async () => {
		const { selected, workbenchService } = await setupRemovedInstallation('remote', aGalleryExtension('a'));
		const extension: Mutable<IWorkbenchExtension> = selected;
		extension.deprecationInfo = { additionalInfo: 'Deprecated extension' };
		instantiationService.set(IDialogService, new TestDialogService(undefined, { result: 3 }));
		let calls = 0;
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'install', async () => { calls++; });
		const action = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		action.extension = selected;
		await timeout(0);
		await action.run();
		assert.deepStrictEqual({ enabled: action.enabled, calls }, { enabled: true, calls: 0 });
	});
});

suite('RemoteInstallAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setupTest(disposables));

	test('Test remote install action is enabled for local workspace extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test remote install action when installing local workspace extension', async () => {
		// multi server setup
		const remoteExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);

		onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery, profileLocation: null! });
		assert.ok(!testObject.enabled);
		assert.strictEqual('Installing in remote', testObject.label);
		assert.strictEqual('extension-action label install-other-server installing', testObject.class);
	});

	test('Test remote install action when installing local workspace extension is finished', async () => {
		// multi server setup
		const remoteExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);

		onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery, profileLocation: null! });
		assert.ok(!testObject.enabled);
		assert.strictEqual('Installing in remote', testObject.label);
		assert.strictEqual('extension-action label install-other-server installing', testObject.class);

		const installedExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: InstallOperation.Install, profileLocation: null! }]);
		await promise;
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for disabled local workspace extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test remote install action is enabled local workspace+ui extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test remote install action is enabled for local ui+workapace extension if can install is true', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, true));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test remote install action is disabled for local ui+workapace extension if can install is false', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled when extension is not set', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for extension which is not installed', async () => {
		// multi server setup
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const pager = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = pager.firstPage[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension which is disabled in env', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		const environmentService = { disableExtensions: true } as INativeWorkbenchEnvironmentService;
		instantiationService.stub(IEnvironmentService, environmentService);
		instantiationService.stub(INativeEnvironmentService, environmentService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled when remote server is not available', async () => {
		// single server setup
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const extensionManagementServerService = instantiationService.get(IExtensionManagementServerService);
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension if it is uninstalled locally', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);

		uninstallEvent.fire({ identifier: localWorkspaceExtension.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension if it is installed in remote', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for local workspace extension if it has not gallery', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace system extension', async () => {
		// multi server setup
		const localWorkspaceSystemExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`), type: ExtensionType.System });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceSystemExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceSystemExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local ui extension if it is not installed in remote', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local ui extension if it is also installed in remote', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for locally installed language pack extension', async () => {
		// multi server setup
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([languagePackExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test remote install action is disabled if local language pack extension is uninstalled', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);

		uninstallEvent.fire({ identifier: languagePackExtension.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});
});

suite('LocalInstallAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setupTest(disposables));

	test('Test local install action is enabled for remote ui extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test local install action is enabled for remote ui+workspace extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test local install action when installing remote ui extension', async () => {
		// multi server setup
		const localExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		localExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);

		onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery, profileLocation: null! });
		assert.ok(!testObject.enabled);
		assert.strictEqual('Installing Locally', testObject.label);
		assert.strictEqual('extension-action label install-other-server installing', testObject.class);
	});

	test('Test local install action when installing remote ui extension is finished', async () => {
		// multi server setup
		const localExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		localExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);

		onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery, profileLocation: null! });
		assert.ok(!testObject.enabled);
		assert.strictEqual('Installing Locally', testObject.label);
		assert.strictEqual('extension-action label install-other-server installing', testObject.class);

		const installedExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: InstallOperation.Install, profileLocation: null! }]);
		await promise;
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for disabled remote ui extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localUIExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test local install action is disabled when extension is not set', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for extension which is not installed', async () => {
		// multi server setup
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const pager = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = pager.firstPage[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote ui extension which is disabled in env', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const environmentService = { disableExtensions: true } as INativeWorkbenchEnvironmentService;
		instantiationService.stub(IEnvironmentService, environmentService);
		instantiationService.stub(INativeEnvironmentService, environmentService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled when local server is not available', async () => {
		// single server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aSingleRemoteExtensionManagementServerService(instantiationService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote ui extension if it is installed in local', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remoteUI extension if it is uninstalled locally', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [remoteUIExtension]);
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);

		uninstallEvent.fire({ identifier: remoteUIExtension.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for remote UI extension if it has gallery', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test local install action is disabled for remote UI system extension', async () => {
		// multi server setup
		const remoteUISystemExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }), type: ExtensionType.System });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUISystemExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUISystemExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote workspace extension if it is not installed in local', async () => {
		// multi server setup
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote workspace extension if it is also installed in local', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspae'] }, { location: URI.file(`pub.a`) });
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for remotely installed language pack extension', async () => {
		// multi server setup
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([languagePackExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
	});

	test('Test local install action is disabled if remote language pack extension is uninstalled', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
		const workbenchService: IExtensionsWorkbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);

		uninstallEvent.fire({ identifier: languagePackExtension.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

});

suite('EnableAIFeaturesInWorkspaceAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		setupTest(disposables);
		instantiationService.stub(IProductService, { defaultChatAgent: { chatExtensionId: 'GitHub.copilot-chat' } } as Partial<IProductService>);
	});

	test('test enable AI in workspace updates workspace setting when AI is disabled globally', async () => {
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);

		let updatedValue: { key: string; value: unknown; target: unknown } | undefined;
		const originalUpdateValue = configurationService.updateValue.bind(configurationService);
		configurationService.updateValue = async (key: string, value: unknown, target?: any) => {
			updatedValue = { key, value, target };
			return originalUpdateValue(key, value);
		};

		const chatExtension = aLocalExtension('copilot-chat', { publisher: 'GitHub' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [chatExtension]);

		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		await workbenchService.queryLocal();

		const extensions = workbenchService.local;
		const copilotChat = extensions.find(e => e.identifier.id === 'github.copilot-chat');
		assert.ok(copilotChat);

		const testObject: ExtensionsActions.EnableAIFeaturesInWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableAIFeaturesInWorkspaceAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		testObject.extension = copilotChat;
		assert.ok(testObject.enabled);

		await testObject.run();

		assert.ok(updatedValue, 'updateValue should have been called');
		assert.strictEqual(updatedValue.key, ChatAIDisabledSettingId);
		assert.strictEqual(updatedValue.value, false, 'workspace setting should be set to false');
	});

});

function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
	manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
	properties = {
		type: ExtensionType.User,
		location: URI.file(`pub.${name}`),
		identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
		...properties,
		isValid: properties.isValid ?? true,
	};
	properties.isBuiltin = properties.type === ExtensionType.System;
	return <ILocalExtension>Object.create({ manifest, ...properties });
}

function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
	const targetPlatform = getTargetPlatform(platform, arch);
	const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, isSigned: true, ...properties });
	galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
	galleryExtension.assets = { ...galleryExtension.assets, ...assets };
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
	galleryExtension.hasReleaseVersion = true;
	return <IGalleryExtension>galleryExtension;
}

function aPage<T>(...objects: T[]): IPager<T> {
	return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
}

function aSingleRemoteExtensionManagementServerService(instantiationService: TestInstantiationService, remoteExtensionManagementService?: IProfileAwareExtensionManagementService): IExtensionManagementServerService {
	const remoteExtensionManagementServer: IExtensionManagementServer = {
		id: 'vscode-remote',
		label: 'remote',
		extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
	};
	return {
		_serviceBrand: undefined,
		localExtensionManagementServer: null,
		remoteExtensionManagementServer,
		webExtensionManagementServer: null,
		getExtensionManagementServer: (extension: IExtension) => {
			if (extension.location.scheme === Schemas.vscodeRemote) {
				return remoteExtensionManagementServer;
			}
			return null;
		},
		getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
			const server = this.getExtensionManagementServer(extension);
			return server === remoteExtensionManagementServer ? ExtensionInstallLocation.Remote : ExtensionInstallLocation.Local;
		}
	};
}

function aMultiExtensionManagementServerService(instantiationService: TestInstantiationService, localExtensionManagementService?: IProfileAwareExtensionManagementService | null, remoteExtensionManagementService?: IProfileAwareExtensionManagementService | null, webExtensionManagementService?: IProfileAwareExtensionManagementService): IExtensionManagementServerService {
	const localExtensionManagementServer: IExtensionManagementServer | null = localExtensionManagementService === null ? null : {
		id: 'vscode-local',
		label: 'local',
		extensionManagementService: localExtensionManagementService || createExtensionManagementService(),
	};
	const remoteExtensionManagementServer: IExtensionManagementServer | null = remoteExtensionManagementService === null ? null : {
		id: 'vscode-remote',
		label: 'remote',
		extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
	};
	const webExtensionManagementServer: IExtensionManagementServer | null = webExtensionManagementService ? {
		id: 'vscode-web',
		label: 'web',
		extensionManagementService: webExtensionManagementService,
	} : null;
	return {
		_serviceBrand: undefined,
		localExtensionManagementServer,
		remoteExtensionManagementServer,
		webExtensionManagementServer,
		getExtensionManagementServer: (extension: IExtension) => {
			if (extension.location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			if (extension.location.scheme === Schemas.vscodeRemote) {
				return remoteExtensionManagementServer;
			}
			if (extension.location.scheme === Schemas.vscodeUserData) {
				return webExtensionManagementServer;
			}
			throw new Error('');
		},
		getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
			const server = this.getExtensionManagementServer(extension);
			if (server === null) {
				return null;
			}
			if (server === remoteExtensionManagementServer) {
				return ExtensionInstallLocation.Remote;
			}
			if (server === webExtensionManagementServer) {
				return ExtensionInstallLocation.Web;
			}
			return ExtensionInstallLocation.Local;
		}
	};
}

function createExtensionManagementService(installed: ILocalExtension[] = []): IProfileAwareExtensionManagementService {
	return <IProfileAwareExtensionManagementService>{
		onInstallExtension: Event.None,
		onDidInstallExtensions: Event.None,
		onUninstallExtension: Event.None,
		onDidUninstallExtension: Event.None,
		onDidChangeProfile: Event.None,
		onDidUpdateExtensionMetadata: Event.None,
		onProfileAwareDidInstallExtensions: Event.None,
		getInstalled: () => Promise.resolve<ILocalExtension[]>(installed),
		canInstall: async (extension: IGalleryExtension) => { return true; },
		installFromGallery: (extension: IGalleryExtension) => Promise.reject(new Error('not supported')),
		updateMetadata: async (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>, profileLocation: URI) => {
			local.identifier.uuid = metadata.id;
			local.publisherDisplayName = metadata.publisherDisplayName!;
			local.publisherId = metadata.publisherId!;
			return local;
		},
		async getTargetPlatform() { return getTargetPlatform(platform, arch); },
		async getExtensionsControlManifest() { return <IExtensionsControlManifest>{ malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
	};
}
