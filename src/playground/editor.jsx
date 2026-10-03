/**
 * Copyright (C) 2021 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Modified entry: renders the ForgeExt directly.
// (The original TurboWarp GUI has been removed entirely.)

import React from 'react';

import ExtensionBuilder from '../extension-builder/components/ExtensionBuilder.jsx';
import render from './app-target';

document.title = 'ForgeExt';
render(<ExtensionBuilder />);

// Register service worker for installable PWA (production only, avoids
// interfering with the webpack-dev-server workflow during development)
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
