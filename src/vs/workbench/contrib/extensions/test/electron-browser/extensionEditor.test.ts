/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionGalleryService, IGalleryExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IExtensionManagementServer, IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { ExtensionEditor } from '../../browser/extensionEditor.js';
import * as ExtensionActions from '../../browser/extensionsActions.js';
import * as ExtensionWidgets from '../../browser/extensionsWidgets.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { ExtensionsInput } from '../../common/extensionsInput.js';

suite('Extension editor installation selection', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const localServer = upcastPartial<IExtensionManagementServer>({ id: 'local', label: 'Local' });
	const remoteServer = upcastPartial<IExtensionManagementServer>({ id: 'remote', label: 'WSL: Ubuntu' });

	function extension(server: IExtensionManagementServer, id = 'publisher.extension'): IExtension {
		return upcastPartial<IExtension>({ identifier: { id }, displayName: id, server });
	}

	function createEditor(): ExtensionEditor {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, {});
		instantiationService.stub(IExtensionGalleryService, {});
		instantiationService.stub(IExtensionRecommendationsService, {});
		instantiationService.stub(IWebviewService, {});
		return disposables.add(instantiationService.createInstance(ExtensionEditor, new TestEditorGroupView(1)));
	}

	function renderableExtension(server: IExtensionManagementServer, overrides: Partial<IExtension> = {}): IExtension {
		return upcastPartial<IExtension>({
			...extension(server),
			displayName: server.label,
			state: ExtensionState.Installed,
			categories: [],
			dependencies: [],
			async getManifest() { return null; },
			async getReadme() { throw new Error('No readme'); },
			hasChangelog: () => server === remoteServer,
			...overrides,
		});
	}

	function createRenderedEditor(gallery: Partial<IExtensionGalleryService> = {}) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const events = disposables.add(new DisposableStore());
		const rendered = disposables.add(new Emitter<void>());
		const errors = disposables.add(new Emitter<Parameters<INotificationService['error']>[0]>());
		instantiationService.stub(IExtensionsWorkbenchService, { onChange: Event.None, installed: [] });
		instantiationService.stub(IExtensionGalleryService, gallery);
		instantiationService.stub(IExtensionRecommendationsService, { getAllRecommendationsWithReason: () => ({}) });
		instantiationService.stub(IWebviewService, {});
		instantiationService.stub(IExtensionManagementServerService, {
			localExtensionManagementServer: localServer,
			remoteExtensionManagementServer: remoteServer,
		});
		instantiationService.stub(ITelemetryService, { publicLog: () => rendered.fire() });
		instantiationService.stub(INotificationService, { error: error => errors.fire(error) });

		// Keep the real editor, location, uninstall action and navigation. Unrelated
		// controls do not need their external services for these rendering tests.
		for (const action of [
			ExtensionActions.ExtensionRuntimeStateAction, ExtensionActions.ExtensionStatusLabelAction,
			ExtensionActions.UpdateAction, ExtensionActions.SetColorThemeAction, ExtensionActions.SetFileIconThemeAction,
			ExtensionActions.SetProductIconThemeAction, ExtensionActions.SetLanguageAction, ExtensionActions.ClearLanguageAction,
			ExtensionActions.EnableDropDownAction, ExtensionActions.TogglePreReleaseExtensionAction, ExtensionActions.DisableDropDownAction,
			ExtensionActions.RemoteInstallAction, ExtensionActions.LocalInstallAction, ExtensionActions.WebInstallAction,
			ExtensionActions.InstallDropdownAction, ExtensionActions.InstallingLabelAction, ExtensionActions.ToggleAutoUpdateForExtensionAction,
			ExtensionActions.ExtensionStatusAction, ExtensionActions.MigrateDeprecatedExtensionAction, ExtensionActions.InstallAnotherVersionAction,
		]) {
			const stub = disposables.add(new class extends ExtensionActions.ExtensionAction {
				update(): void { }
			}(action.name));
			stub.enabled = false;
			instantiationService.stubInstance<Action>(action, stub);
		}
		for (const widget of [
			ExtensionWidgets.PublisherWidget, ExtensionWidgets.ExtensionKindIndicatorWidget, ExtensionWidgets.InstallCountWidget,
			ExtensionWidgets.RatingsWidget, ExtensionWidgets.SponsorWidget, ExtensionWidgets.ExtensionStatusWidget,
			ExtensionWidgets.ExtensionRecommendationWidget,
		]) {
			instantiationService.stubInstance<ExtensionWidgets.ExtensionWidget>(widget, disposables.add(new class extends ExtensionWidgets.ExtensionWidget {
				readonly onDidRender = Event.None;
				render(): void { }
			}()));
		}

		const editor = disposables.add(instantiationService.createInstance(ExtensionEditor, new TestEditorGroupView(1)));
		const container = $('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		editor.create(container);
		return { editor, container, events, rendered: rendered.event, errors: errors.event };
	}

	test('local and remote inputs share one editor identity', () => {
		const localInput = disposables.add(new ExtensionsInput(extension(localServer)));
		const remoteInput = disposables.add(new ExtensionsInput(extension(remoteServer)));
		const resource = localInput.resource.toString();

		localInput.updateExtension(remoteInput.extension);

		assert.deepStrictEqual({
			matches: localInput.matches(remoteInput),
			resource: localInput.resource.toString(),
			server: localInput.extension.server,
		}, { matches: true, resource, server: remoteServer });
	});

	for (const [initialServer, selectedServer] of [[localServer, remoteServer], [remoteServer, localServer]]) {
		test(`retargets the active editor from ${initialServer.id} to ${selectedServer.id}`, async () => {
			const editor = createEditor();
			const input = disposables.add(new ExtensionsInput(extension(initialServer)));
			const selected = extension(selectedServer);
			await editor.setInput(input, undefined, {}, CancellationToken.None);

			editor.setOptions({ extension: selected, preserveFocus: true, pinned: true });

			assert.deepStrictEqual({
				input: editor.input,
				extension: input.extension,
				preserveFocus: editor.options?.preserveFocus,
				pinned: editor.options?.pinned,
			}, { input, extension: selected, preserveFocus: true, pinned: true });
		});

		test(`retargets an inactive retained input from ${initialServer.id} to ${selectedServer.id}`, async () => {
			const editor = createEditor();
			const input = disposables.add(new ExtensionsInput(extension(initialServer)));
			const selected = extension(selectedServer);

			// The editor group retains its existing matching input when it is reopened.
			await editor.setInput(input, { extension: selected }, {}, CancellationToken.None);

			assert.deepStrictEqual({ input: editor.input, extension: input.extension }, { input, extension: selected });
		});
	}

	test('ignores installation options for a different extension', async () => {
		const editor = createEditor();
		const original = extension(localServer);
		const input = disposables.add(new ExtensionsInput(original));
		const other = extension(remoteServer, 'publisher.other');
		await editor.setInput(input, { extension: other }, {}, CancellationToken.None);
		editor.setOptions({ extension: other });

		assert.strictEqual(input.extension, original);
	});

	test('ordinary options do not change the selected installation', async () => {
		const editor = createEditor();
		const original = extension(remoteServer);
		const input = disposables.add(new ExtensionsInput(original));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		editor.setOptions({ preserveFocus: true });

		assert.strictEqual(input.extension, original);
	});

	test('a slower gallery response cannot restore the previous installation header or actions', async () => {
		const galleryStarted = new DeferredPromise<void>();
		const pendingGallery = new DeferredPromise<IGalleryExtension[]>();
		const { editor, container, events, rendered } = createRenderedEditor({
			getExtensions: async () => {
				galleryStarted.complete();
				return pendingGallery.p;
			},
		});
		const input = disposables.add(new ExtensionsInput(renderableExtension(localServer, { hasPreReleaseVersion: true })));
		const initialRender = editor.setInput(input, { showPreReleaseVersion: true, preserveFocus: true }, {}, CancellationToken.None);
		await galleryStarted.p;

		const nextRender = Event.toPromise(rendered, events);
		editor.setOptions({ extension: renderableExtension(remoteServer), preserveFocus: true });
		await nextRender;
		await pendingGallery.complete([]);
		await initialRender;

		assert.deepStrictEqual({
			name: container.querySelector('.name')?.textContent,
			location: container.querySelector('.extension-location')?.textContent,
			uninstall: container.querySelector('.actions-status-container')?.textContent?.includes('Uninstall from WSL: Ubuntu'),
			changelog: container.querySelector('.navbar')?.textContent?.includes('Changelog'),
		}, { name: 'WSL: Ubuntu', location: 'Location: WSL: Ubuntu', uninstall: true, changelog: true });
	});

	test('a slower manifest cannot replace the selected installation navigation', async () => {
		const manifestStarted = new DeferredPromise<CancellationToken>();
		const pendingManifest = new DeferredPromise<IExtensionManifest | null>();
		const { editor, container, events, rendered } = createRenderedEditor();
		const local = renderableExtension(localServer, {
			getManifest: async token => {
				manifestStarted.complete(token);
				return pendingManifest.p;
			},
		});
		const input = disposables.add(new ExtensionsInput(local));
		const initialRender = editor.setInput(input, { preserveFocus: true }, {}, CancellationToken.None);
		const staleToken = await manifestStarted.p;

		const nextRender = Event.toPromise(rendered, events);
		editor.setOptions({ extension: renderableExtension(remoteServer), preserveFocus: true });
		await nextRender;
		await pendingManifest.complete(null);
		await initialRender;

		assert.deepStrictEqual({
			cancelled: staleToken.isCancellationRequested,
			location: container.querySelector('.extension-location')?.textContent,
			changelog: container.querySelector('.navbar')?.textContent?.includes('Changelog'),
		}, { cancelled: true, location: 'Location: WSL: Ubuntu', changelog: true });
	});

	test('reports a manifest failure when retargeting an active editor', async () => {
		const { editor, events, errors } = createRenderedEditor();
		const input = disposables.add(new ExtensionsInput(renderableExtension(localServer)));
		await editor.setInput(input, { preserveFocus: true }, {}, CancellationToken.None);
		const error = new Error('Manifest request failed');
		const reportedError = Event.toPromise(errors, events);

		editor.setOptions({ extension: renderableExtension(remoteServer, { async getManifest() { throw error; } }), preserveFocus: true });

		assert.strictEqual(await reportedError, error);
	});
});
