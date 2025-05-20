import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from 'react-dom/client';
import React from 'react';
import './index.css';
import App from './App.jsx';
import {Provider} from 'react-redux';
import store from './store';
import {createBrowserRouter, createRoutesFromElements, Route, RouterProvider} from 'react-router-dom'
import LandingDisplay from './pages/Landingpage/LandingDisplay.jsx'

const routes = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<LandingDisplay />}>
    < Route path="landing" element={<LandingDisplay />} />
      </Route>

  ))

const root = ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
    <RouterProvider router={routes}/>
    </Provider>
  </React.StrictMode>
)
