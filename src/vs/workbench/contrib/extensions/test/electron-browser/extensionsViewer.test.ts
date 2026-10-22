/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOpenEvent, WorkbenchPagedList } from '../../../../../platform/list/browser/listService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IExtensionManagementServer } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { Renderer } from '../../browser/extensionsList.js';
import { ExtensionsList } from '../../browser/extensionsViewer.js';
import { IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { IExtensionEditorOptions } from '../../common/extensionsInput.js';

suite('Extensions list installation selection', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const localServer = upcastPartial<IExtensionManagementServer>({ id: 'local', label: 'Local' });
	const remoteServer = upcastPartial<IExtensionManagementServer>({ id: 'remote', label: 'WSL: Ubuntu' });
	const local = upcastPartial<IExtension>({ identifier: { id: 'publisher.extension' }, server: localServer });
	const remote = upcastPartial<IExtension>({ identifier: local.identifier, server: remoteServer });
	const gallery = upcastPartial<IExtension>({ identifier: local.identifier });

	for (const [name, selected, expected] of [
		['local', local, local],
		['remote', remote, remote],
		['gallery', gallery, remote],
	] as const) {
		test(`opens the ${name} selection with the expected installation`, () => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const onDidOpen = disposables.add(new Emitter<IOpenEvent<IExtension | undefined>>());
			instantiationService.stubInstance(Renderer, {});
			instantiationService.stubInstance(WorkbenchPagedList, {
				onDidOpen: onDidOpen.event,
				onContextMenu: Event.None,
				dispose() { },
			});
			instantiationService.stub(IViewDescriptorService, { getViewLocationById: () => ViewContainerLocation.Sidebar });
			let openedExtension: IExtension | string | undefined;
			let openedOptions: IExtensionEditorOptions | undefined;
			instantiationService.stub(IExtensionsWorkbenchService, {
				local: [remote],
				async open(extension, options) {
					openedExtension = extension;
					openedOptions = options;
				},
			});
			disposables.add(instantiationService.createInstance(ExtensionsList, $('div'), 'test.extensions', {}, { onFocus: Event.None, onBlur: Event.None, filters: {} }));

			onDidOpen.fire({ element: selected, sideBySide: false, editorOptions: { pinned: true, preserveFocus: true } });

			assert.deepStrictEqual({ extension: openedExtension, options: openedOptions }, {
				extension: expected,
				options: { sideByside: false, pinned: true, preserveFocus: true, modal: undefined },
			});
		});
	}
});
