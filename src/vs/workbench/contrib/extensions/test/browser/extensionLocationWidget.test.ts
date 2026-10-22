/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFormatterChangeEvent, ILabelService } from '../../../../../platform/label/common/label.js';
import { IExtensionManagementServer, IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionLocationWidget } from '../../browser/extensionsWidgets.js';
import { ExtensionState, IExtension } from '../../common/extensions.js';

suite('ExtensionLocationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const localServer = upcastPartial<IExtensionManagementServer>({ id: 'local', label: 'Local' });
	const remoteServer = upcastPartial<IExtensionManagementServer>({ id: 'remote', label: 'WSL: Ubuntu' });
	const webServer = upcastPartial<IExtensionManagementServer>({ id: 'web', label: 'Browser' });
	let instantiationService: TestInstantiationService;
	let onDidChangeFormatters: Emitter<IFormatterChangeEvent>;
	let parent: HTMLElement;
	let getHoverText: () => string;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		onDidChangeFormatters = store.add(new Emitter<IFormatterChangeEvent>());
		instantiationService.stub(ILabelService, { onDidChangeFormatters: onDidChangeFormatters.event });
		getHoverText = () => '';
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (element, options) => {
				getHoverText = () => {
					const content = (typeof options === 'function' ? options() : options).content;
					return typeof content === 'string' ? content : '';
				};
				return NullHoverService.setupDelayedHover(element, options);
			},
		});
		parent = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => parent.remove()));
	});

	function createWidget(local: IExtensionManagementServer | null, remote: IExtensionManagementServer | null, web: IExtensionManagementServer | null = null): ExtensionLocationWidget {
		instantiationService.stub(IExtensionManagementServerService, {
			localExtensionManagementServer: local,
			remoteExtensionManagementServer: remote,
			webExtensionManagementServer: web,
		});
		return store.add(instantiationService.createInstance(ExtensionLocationWidget, parent));
	}

	function label(): { text: string | null; hidden: boolean; hover: string } {
		const element = parent.querySelector<HTMLElement>('.extension-location')!;
		return { text: element.textContent, hidden: Boolean(element.hidden), hover: getHoverText() };
	}

	for (const clientServer of [localServer, webServer]) {
		test(`updates the visible location when switching between ${clientServer.label} and remote`, () => {
			const widget = createWidget(clientServer === localServer ? localServer : null, remoteServer, clientServer === webServer ? webServer : null);
			const labels = [];
			for (const server of [clientServer, remoteServer, clientServer]) {
				widget.extension = upcastPartial<IExtension>({ server });
				labels.push(label());
			}
			assert.deepStrictEqual(labels, [clientServer, remoteServer, clientServer].map(server => ({ text: `Location: ${server.label}`, hidden: false, hover: `Location: ${server.label}` })));
		});
	}

	test('keeps the selected location after uninstalling', () => {
		const widget = createWidget(localServer, remoteServer);
		const extension = { server: remoteServer, state: ExtensionState.Installed };
		widget.extension = upcastPartial<IExtension>(extension);
		extension.state = ExtensionState.Uninstalled;
		widget.update();
		assert.deepStrictEqual(label(), { text: 'Location: WSL: Ubuntu', hidden: false, hover: 'Location: WSL: Ubuntu' });
	});

	test('clears the location for serverless previews and when clearing the editor', () => {
		const widget = createWidget(localServer, remoteServer);
		widget.extension = upcastPartial<IExtension>({ server: remoteServer });
		widget.extension = upcastPartial<IExtension>({});
		const previewLabel = label();
		widget.extension = upcastPartial<IExtension>({ server: localServer });
		widget.extension = null;
		assert.deepStrictEqual([previewLabel, label()], [
			{ text: '', hidden: true, hover: '' },
			{ text: '', hidden: true, hover: '' },
		]);
	});

	test('does not add a location in a single-server window', () => {
		const widget = createWidget(localServer, null);
		widget.extension = upcastPartial<IExtension>({ server: localServer });
		assert.deepStrictEqual(label(), { text: '', hidden: true, hover: '' });
	});

	test('identifies workspace-scoped extensions without implying a server-wide installation', () => {
		const widget = createWidget(localServer, remoteServer);
		widget.extension = upcastPartial<IExtension>({ server: remoteServer, isWorkspaceScoped: true });
		assert.deepStrictEqual(label(), { text: 'Location: Workspace', hidden: false, hover: 'Location: Workspace' });
	});

	test('refreshes the remote name when its label formatter changes', () => {
		const server = { ...remoteServer, label: 'Remote' };
		const widget = createWidget(localServer, server);
		widget.extension = upcastPartial<IExtension>({ server });
		server.label = 'WSL: Ubuntu';
		onDidChangeFormatters.fire({ scheme: 'vscode-remote' });
		assert.deepStrictEqual(label(), { text: 'Location: WSL: Ubuntu', hidden: false, hover: 'Location: WSL: Ubuntu' });
	});
});
