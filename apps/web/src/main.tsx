import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Landing from './routes/Landing'
import Console from './routes/Console'
import './styles/base.css'
import './styles/sight.css'
import './styles/pages.css'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/console', element: <Console /> },
  { path: '*', element: <Landing /> },
])

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
